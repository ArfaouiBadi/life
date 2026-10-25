import type { Id, MetricKey, Prediction } from "@/api/contracts";
import { MARS_HOUR_S, SOL_S, lmstAt } from "@/lib/marsTime";
import { NOISE, PHYS } from "../physics/constants";
import { energyBalanceSecondsToEmpty, loadKW, solarKW } from "../physics/power";
import { netLossLps, recyclePct, waterSecondsToEmpty } from "../physics/water";
import { zonesOf } from "../physics/atmosphere";
import type { Sample, SimHome, World, Zone } from "../world/types";
import { estimateLeakAreaCm2, fitExpDecay, fitLinear, linearSecondsTo, onsetIndex, secondsToThreshold, type Pt } from "./regression";

export const FIT_WINDOW_S = 600;
export const HEADLINE_HORIZON_S = 48 * 3600;

export interface ZoneFit {
  zone: Zone;
  samples: Sample[];
  occupied: boolean;
  kP: number | null; // pressure decay rate
  r2P: number;
  leakAreaCm2: number;
  leakRoomId: Id | null; // loudest ultrasonic sensor ≥ 0.5
  last: Sample | null;
}

export function zoneSamples(home: SimHome, zone: Zone, now: number): Sample[] {
  const room = home.rooms.find((r) => r.id === zone.roomIds[0])!;
  const since = Math.max(room.zoneSince, now - FIT_WINDOW_S);
  return room.history.toArray().filter((s) => s.t >= since);
}

/**
 * Cheap pre-check: did zone pressure drop by more than 4σ across the fit window?
 * Quiet zones skip the regression entirely (most of the fleet, most of the time).
 */
function pressureDropped(home: SimHome, zone: Zone, now: number) {
  const ring = home.rooms.find((r) => r.id === zone.roomIds[0])!.history;
  const n = ring.length;
  if (n < 8) return false;
  let first = n - 1;
  const since = now - FIT_WINDOW_S;
  while (first > 0 && ring.at(first - 1).t >= since) first--;
  if (n - first < 8) return false;
  const head = (ring.at(first).p + ring.at(first + 1).p + ring.at(first + 2).p + ring.at(first + 3).p) / 4;
  const tail = (ring.at(n - 1).p + ring.at(n - 2).p + ring.at(n - 3).p + ring.at(n - 4).p) / 4;
  return Math.abs(head - tail) > 4 * NOISE.pressure;
}

export function fitZones(home: SimHome, w: World, acoustic: Map<Id, number>, full: boolean): ZoneFit[] {
  const occupiedRooms = new Set(home.occupants.map((o) => o.roomId));
  return zonesOf(home).map((zone) => {
    const ring = home.rooms.find((r) => r.id === zone.roomIds[0])!.history;
    const moving = pressureDropped(home, zone, w.t);
    let samples: Sample[] = [];
    let fit: ReturnType<typeof fitExpDecay> = null;
    if (moving || full) {
      const all = zoneSamples(home, zone, w.t);
      samples = all.slice(onsetIndex(all.map((x) => x.p), NOISE.pressure));
      if (moving) fit = fitExpDecay(samples.map((s) => ({ t: s.t, v: s.p })));
    }
    let leakRoomId: Id | null = null;
    let loudest = 0.5;
    for (const id of zone.roomIds) {
      const a = acoustic.get(id) ?? 0;
      if (a >= loudest) {
        loudest = a;
        leakRoomId = id;
      }
    }
    return {
      zone,
      samples,
      occupied: zone.roomIds.some((id) => occupiedRooms.has(id)),
      kP: fit ? fit.k : null,
      r2P: fit ? fit.r2 : 0,
      leakAreaCm2: fit && fit.k > 0 ? estimateLeakAreaCm2(fit.k, zone.volumeM3) : 0,
      leakRoomId,
      last: ring.last() ?? null,
    };
  });
}

/**
 * Countdown smoothing: carry the previous estimate forward by the elapsed time, then move a
 * third of the way toward the new fit. Keeps the number ticking down steadily while the fit settles.
 */
const smoothState = new WeakMap<SimHome, Map<string, { v: number; t: number }>>();
function smooth(home: SimHome, key: string, raw: number | null, t: number): number | null {
  let m = smoothState.get(home);
  if (!m) smoothState.set(home, (m = new Map()));
  if (raw === null) {
    m.delete(key);
    return null;
  }
  const prev = m.get(key);
  const carried = prev ? Math.max(0, prev.v - (t - prev.t)) : raw;
  const v = prev && Math.abs(raw - carried) < raw * 0.5 ? carried + (raw - carried) / 3 : raw;
  m.set(key, { v, t });
  return v;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const tail = (s: Sample[], key: keyof Sample, n = 5) => mean(s.slice(-n).map((x) => x[key]));

export function computePredictions(home: SimHome, w: World, fits: ZoneFit[], full: boolean): Prediction[] {
  const iso = new Date(w.epochMs + w.t * 1000).toISOString();
  const out: Prediction[] = [];
  const base = (zone: Zone, metric: MetricKey, occupied: boolean) => ({
    id: `${home.id}:${metric}:${zone.roomIds[0]}`,
    homeId: home.id,
    roomId: zone.roomIds.length === 1 ? zone.roomIds[0] : null,
    zoneRoomIds: zone.roomIds,
    metric,
    occupied,
    computedAt: iso,
  });

  for (const f of fits) {
    if (f.samples.length < 8) continue;
    const isAirlock = f.zone.roomIds.every((id) => home.rooms.find((r) => r.id === id)?.type === "AIRLOCK");
    if (isAirlock) continue;

    // Oxygen: exponential decay.
    const leaking = f.kP !== null && f.kP > 5e-6 && f.r2P > 0.8;
    const o2Pts: Pt[] = full || leaking ? f.samples.map((s) => ({ t: s.t, v: s.o2 })) : [];
    const o2Fit = full || leaking ? fitExpDecay(o2Pts) : null;
    if (o2Fit) {
      const current = tail(f.samples, "o2");
      // A leak removes every gas at the same rate k, and the pressure fit is the less noisy
      // estimate of it (σ 0.02 on 101 kPa vs σ 0.01 on 21 kPa), so time-to-danger uses kP.
      const k = leaking ? f.kP! : o2Fit.k;
      const decaying = leaking || (o2Fit.k > 5e-6 && o2Fit.r2 > 0.6);
      const raw = decaying ? secondsToThreshold(current, PHYS.PPO2_UNSAFE, k) : null;
      out.push({
        ...base(f.zone, "PPO2_KPA", f.occupied),
        current,
        threshold: PHYS.PPO2_UNSAFE,
        secondsToThreshold: smooth(home, `${f.zone.roomIds[0]}:o2`, raw, w.t),
        trend: decaying ? "FALLING" : o2Fit.k < -5e-6 && o2Fit.r2 > 0.6 ? "RISING" : "STABLE",
        model: "EXP_DECAY_FIT",
        confidence: leaking ? f.r2P : o2Fit.r2,
        details: {
          k,
          kOxygen: o2Fit.k,
          r2: leaking ? f.r2P : o2Fit.r2,
          zoneVolumeM3: f.zone.volumeM3,
          leakAreaCm2: leaking ? f.leakAreaCm2 : 0,
          samples: f.samples.length,
        },
        fitSeries: full ? o2Pts : undefined,
      });
    }

    // CO2, smoke, dose: linear fits toward the emergency threshold.
    const linear = (metric: MetricKey, key: "co2" | "smoke" | "dose", threshold: number, show: boolean) => {
      if (!show) return;
      const pts = f.samples.map((s) => ({ t: s.t, v: s[key] }));
      const fit = fitLinear(pts);
      if (!fit) return;
      const current = tail(f.samples, key);
      const rising = fit.slope > 0 && fit.r2 > 0.5;
      out.push({
        ...base(f.zone, metric, f.occupied),
        current,
        threshold,
        secondsToThreshold: rising ? linearSecondsTo(current, threshold, fit.slope) : null,
        trend: rising ? "RISING" : fit.slope < 0 && fit.r2 > 0.5 ? "FALLING" : "STABLE",
        model: "LINEAR_FIT",
        confidence: fit.r2,
        details: { slopePerS: fit.slope, r2: fit.r2, samples: fit.n, zoneVolumeM3: f.zone.volumeM3 },
        fitSeries: full ? pts : undefined,
      });
    };
    const last = f.last!;
    linear("CO2_PPM", "co2", 20000, full || last.co2 > 1500);
    linear("SMOKE_IDX", "smoke", 60, last.smoke > 1);
    linear("DOSE_USVH", "dose", 250, last.dose > 20);
  }

  const allRooms = home.rooms.map((r) => r.id);
  const someoneHome = home.occupants.length > 0;
  const homeZone: Zone = { roomIds: allRooms, volumeM3: 0 };

  // Battery: energy balance walked forward over the next 24 Mars hours.
  if (full || (home.batteryTtd !== null && home.batteryTtd < 24 * MARS_HOUR_S)) {
    out.push({
      ...base(homeZone, "BATTERY_KWH", someoneHome),
      id: `${home.id}:BATTERY_KWH`,
      roomId: null,
      current: home.batteryKWh,
      threshold: 0,
      secondsToThreshold: home.batteryTtd,
      trend: home.solarKW - home.loadKW > 0.05 ? "RISING" : home.solarKW - home.loadKW < -0.05 ? "FALLING" : "STABLE",
      model: "ENERGY_BALANCE",
      confidence: 0.9,
      details: { solarKW: home.solarKW, loadKW: home.loadKW, capacityKWh: home.batteryCapKWh },
    });
  }

  // Water: tank over net loss.
  const ttdWater = waterTtd(home);
  if (full || (ttdWater !== null && ttdWater < 14 * SOL_S)) {
    out.push({
      ...base(homeZone, "WATER_L", someoneHome),
      id: `${home.id}:WATER_L`,
      roomId: null,
      current: home.waterTankL,
      threshold: 0,
      secondsToThreshold: ttdWater,
      trend: ttdWater === null ? "STABLE" : "FALLING",
      model: "LINEAR_FIT",
      confidence: 0.95,
      details: { recyclePct: recycleOf(home), lossLPerSol: lossLps(home) * SOL_S },
    });
  }
  return out;
}

export function recycleOf(home: SimHome) {
  const r = home.equipment.find((e) => e.type === "WATER_RECYCLER")!;
  return recyclePct(r.healthPct, r.status === "FAILED");
}
const lossLps = (home: SimHome) => netLossLps(home.occupants.length, home.waterUseLSol, recycleOf(home));
export const waterTtd = (home: SimHome) => waterSecondsToEmpty(home.waterTankL, lossLps(home));

/** Battery time-to-empty with the current dust forecast. Cached for 10 sim-minutes. */
export function updateBatteryTtd(home: SimHome, w: World, force = false) {
  if (!force && w.t - home.batteryTtdAt < 600) return;
  const s = w.settlements.find((x) => x.id === home.settlementId)!;
  const ev = w.regionalEvents.find((e) => e.kind === "DUST_STORM" && e.settlementIds.includes(s.id));
  const endT = ev?.expectedEndAt ? (Date.parse(ev.expectedEndAt) - w.epochMs) / 1000 : Infinity;
  const health = home.equipment.find((e) => e.type === "SOLAR_ARRAY")!.healthPct / 100;
  const nowMs = w.epochMs + w.t * 1000;
  home.batteryTtd = energyBalanceSecondsToEmpty(home.batteryKWh, home.batteryCapKWh, (dtS) => {
    const lmst = lmstAt(nowMs + dtS * 1000, s.lon);
    const tau = w.t + dtS < endT ? s.dustTau : 0.5;
    return solarKW(home.solarPeakKW, lmst, tau, health) - loadKW(home.template, lmst, home.loadsShed);
  });
  home.batteryTtdAt = w.t;
}

/** Headline time-to-danger: smallest time among zones where people are breathing. */
export function headlineTtd(preds: Prediction[]): number | null {
  let best: number | null = null;
  for (const p of preds) {
    if (!p.occupied || p.secondsToThreshold === null || p.secondsToThreshold > HEADLINE_HORIZON_S) continue;
    if (p.metric === "WATER_L") continue;
    if (best === null || p.secondsToThreshold < best) best = p.secondsToThreshold;
  }
  return best;
}
