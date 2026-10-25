import type { EquipmentType, Id, IncidentType, MetricKey, Prediction, Severity } from "@/api/contracts";
import { maxSev, sevRank } from "@/api/contracts";
import { MARS_HOUR_S, SOL_S, formatMarsHours, lmstAt } from "@/lib/marsTime";
import type { ZoneFit } from "../predict/predictions";
import { waterTtd } from "../predict/predictions";
import type { SimHome, SimRoom, World } from "../world/types";

// Demo thresholds inspired by occupational limits; real values would be set with experts.
export const T = {
  PPO2: { W: 19.5, C: 17.5, E: 16.0 },
  CO2: { W: 2500, C: 5000, E: 20000 },
  SMOKE: { W: 10, C: 30, E: 60 },
  HOT: { W: 30, C: 40 },
  COLD: { W: 15, C: 10 },
  DOSE: { W: 30, C: 100, E: 250 },
  LEAK_K: 5e-6,
  LEAK_R2: 0.8,
  ACOUSTIC: 0.5,
} as const;

export const HYSTERESIS_S = 30;

const above = (v: number, t: { W: number; C: number; E?: number }): Severity =>
  t.E !== undefined && v > t.E ? "EMERGENCY" : v > t.C ? "CRITICAL" : v > t.W ? "WARNING" : "NOMINAL";
const below = (v: number, t: { W: number; C: number; E?: number }): Severity =>
  t.E !== undefined && v < t.E ? "EMERGENCY" : v < t.C ? "CRITICAL" : v < t.W ? "WARNING" : "NOMINAL";

/** Time left drives severity: ≤2 h at least warning, ≤30 min at least critical, ≤10 min emergency. */
export function escalate(sev: Severity, ttd: number | null): Severity {
  if (ttd === null) return sev;
  if (ttd <= 600) return "EMERGENCY";
  if (ttd <= 1800) return maxSev(sev, "CRITICAL");
  if (ttd <= 7200) return maxSev(sev, "WARNING");
  return sev;
}

export interface RawCond {
  key: string;
  rule: string;
  cause: IncidentType;
  roomId: Id | null;
  metric: MetricKey | null;
  sev: Severity;
  occupied: boolean; // capped at WARNING for the home headline when false
  title: string;
  message: string;
}

const EQUIP_CAUSE: Partial<Record<EquipmentType, IncidentType>> = {
  CO2_SCRUBBER: "CO2_BUILDUP",
  WATER_RECYCLER: "WATER_SHORTAGE",
  BATTERY_BANK: "POWER_DEFICIT",
  SOLAR_ARRAY: "POWER_DEFICIT",
};

export function evaluateHome(home: SimHome, w: World, fits: ZoneFit[], preds: Prediction[]): RawCond[] {
  const out: RawCond[] = [];
  const room = (id: Id) => home.rooms.find((r) => r.id === id)!;
  const pred = (metric: MetricKey, firstRoom: Id) => preds.find((p) => p.metric === metric && p.zoneRoomIds[0] === firstRoom);
  const peopleIn = (ids: Id[]) => home.occupants.filter((o) => o.roomId !== null && ids.includes(o.roomId)).length;

  for (const f of fits) {
    const last = f.last;
    if (!last) continue;
    const rs = f.zone.roomIds.map(room);
    if (rs.every((r) => r.type === "AIRLOCK")) continue;
    const first = f.zone.roomIds[0];
    const fire = rs.find((r) => r.fire);
    const busiest = rs.reduce((a, b) => (peopleIn([b.id]) > peopleIn([a.id]) ? b : a), rs[0]);

    // PRESSURE_FALLING: exponential fit, confirmed by the ultrasonic sensor.
    if (f.kP !== null && f.kP > T.LEAK_K && f.r2P > T.LEAK_R2) {
      const confirmed = f.leakRoomId !== null;
      const r = confirmed ? room(f.leakRoomId!) : busiest;
      const o2 = pred("PPO2_KPA", first);
      let sev: Severity = confirmed ? "CRITICAL" : "WARNING";
      sev = escalate(sev, o2?.secondsToThreshold ?? null);
      // A fire burns oxygen too; without a hissing hole, the falling pressure belongs to the fire.
      const fireDriven = !confirmed && (!!fire || last.smoke > 10);
      out.push({
        key: `PRESSURE:${r.id}`,
        rule: "PRESSURE_FALLING",
        cause: fireDriven ? "FIRE" : "PRESSURE_LOSS",
        roomId: r.id,
        metric: "PRESSURE_KPA",
        sev,
        occupied: f.occupied,
        title: confirmed ? `Air leak in ${r.name}` : "Air pressure falling",
        message: confirmed
          ? `Pressure is falling and the leak sensor in ${r.name} hears it. Estimated hole ${f.leakAreaCm2.toFixed(1)} cm².`
          : `Pressure is falling but no leak sensor confirms it yet.`,
      });
    }

    // PPO2_LOW
    const o2Sev = below(last.o2, T.PPO2);
    if (o2Sev !== "NOMINAL") {
      const r = fire ?? (f.leakRoomId ? room(f.leakRoomId) : busiest);
      out.push({
        key: `PPO2:${first}`,
        rule: "PPO2_LOW",
        cause: fire ? "FIRE" : "PRESSURE_LOSS",
        roomId: r.id,
        metric: "PPO2_KPA",
        sev: o2Sev,
        occupied: f.occupied,
        title: `Oxygen low in ${r.name}`,
        message: `Oxygen is at ${last.o2.toFixed(1)} kPa. Below 16 kPa the air is unsafe to breathe.`,
      });
    }

    // CO2_HIGH
    const co2Pred = pred("CO2_PPM", first);
    const co2Sev = escalate(above(last.co2, T.CO2), co2Pred?.secondsToThreshold ?? null);
    if (co2Sev !== "NOMINAL") {
      out.push({
        key: `CO2:${first}`,
        rule: "CO2_HIGH",
        cause: "CO2_BUILDUP",
        roomId: busiest.id,
        metric: "CO2_PPM",
        sev: co2Sev,
        occupied: f.occupied,
        title: `Carbon dioxide high in ${busiest.name}`,
        message: `Carbon dioxide is at ${Math.round(last.co2).toLocaleString("en-US")} ppm.`,
      });
    }

    // SMOKE
    const smokePred = pred("SMOKE_IDX", first);
    const smokeSev = escalate(above(last.smoke, T.SMOKE), smokePred?.secondsToThreshold ?? null);
    if (smokeSev !== "NOMINAL") {
      const r = fire ?? busiest;
      out.push({
        key: `SMOKE:${first}`,
        rule: "SMOKE",
        cause: "FIRE",
        roomId: r.id,
        metric: "SMOKE_IDX",
        sev: smokeSev,
        occupied: f.occupied,
        title: `Smoke in ${r.name}`,
        message: `Smoke index ${Math.round(last.smoke)} of 100.`,
      });
    }

    // TEMPERATURE
    const temp = rs[0].tempC;
    const hot = above(temp, T.HOT);
    const cold = below(temp, T.COLD);
    if (hot !== "NOMINAL" || cold !== "NOMINAL") {
      const isHot = hot !== "NOMINAL";
      const r = fire ?? busiest;
      out.push({
        key: `TEMP:${first}`,
        rule: "TEMPERATURE",
        cause: isHot && (fire || last.smoke > 5) ? "FIRE" : "EQUIPMENT_DEGRADATION",
        roomId: r.id,
        metric: "TEMP_C",
        sev: isHot ? hot : cold,
        occupied: f.occupied,
        title: isHot ? `Too hot in ${r.name}` : `Too cold in ${r.name}`,
        message: `Temperature is ${temp.toFixed(1)} °C.`,
      });
    }
  }

  // DOSE: judged where people are. Nobody home → worst room, capped.
  const occupiedIds = new Set(home.occupants.map((o) => o.roomId));
  const doseRooms = home.rooms.filter((r) => occupiedIds.has(r.id));
  const doseSet = doseRooms.length ? doseRooms : home.rooms;
  const worst = doseSet.reduce((a, b) => (b.dose > a.dose ? b : a), doseSet[0]);
  const doseSev = above(worst.dose, T.DOSE);
  if (doseSev !== "NOMINAL") {
    out.push({
      key: "DOSE",
      rule: "DOSE",
      cause: "RADIATION_EVENT",
      roomId: worst.id,
      metric: "DOSE_USVH",
      sev: doseSev,
      occupied: doseRooms.length > 0,
      title: `Radiation high in ${worst.name}`,
      message: `Dose rate ${Math.round(worst.dose)} µSv/h. The storm shelter cuts it by 85%.`,
    });
  }

  // BATTERY
  if (home.batteryTtd !== null) {
    const ttd = home.batteryTtd;
    const sev: Severity = ttd < 2 * MARS_HOUR_S ? "EMERGENCY" : ttd < 6 * MARS_HOUR_S ? "CRITICAL" : ttd < 24 * MARS_HOUR_S ? "WARNING" : "NOMINAL";
    if (sev !== "NOMINAL") {
      const s = w.settlements.find((x) => x.id === home.settlementId)!;
      const nowMs = w.epochMs + w.t * 1000;
      const emptyAt = lmstAt(nowMs + ttd * 1000, s.lon);
      const lmstNow = lmstAt(nowMs, s.lon);
      const toSunrise = ((6 - lmstNow + 24) % 24) * MARS_HOUR_S;
      const beforeSunrise = ttd < toSunrise;
      const minsEarly = Math.round((toSunrise - ttd) / 60);
      out.push({
        key: "BATTERY",
        rule: "BATTERY",
        cause: "POWER_DEFICIT",
        roomId: null,
        metric: "BATTERY_KWH",
        sev,
        occupied: true,
        title: beforeSunrise ? "Battery won't last until sunrise" : `Battery won't last until ${formatMarsHours((lmstNow + ttd / MARS_HOUR_S) % 24)}`,
        message: beforeSunrise
          ? `Battery runs out at ${formatMarsHours(emptyAt)}, ${minsEarly} minutes before sunrise.`
          : `Battery runs out at ${formatMarsHours(emptyAt)}.`,
      });
    }
  }

  // WATER
  const wt = waterTtd(home);
  if (wt !== null) {
    const sols = wt / SOL_S;
    const sev: Severity = sols < 2 ? "EMERGENCY" : sols < 5 ? "CRITICAL" : sols < 14 ? "WARNING" : "NOMINAL";
    if (sev !== "NOMINAL") {
      const n = Math.max(1, Math.floor(sols));
      out.push({
        key: "WATER",
        rule: "WATER",
        cause: "WATER_SHORTAGE",
        roomId: null,
        metric: "WATER_L",
        sev,
        occupied: true,
        title: `Water runs out in ${n} ${n === 1 ? "sol" : "sols"}`,
        message: `${Math.round(home.waterTankL).toLocaleString("en-US")} L left in the tank.`,
      });
    }
  }

  // EQUIPMENT
  for (const e of home.equipment) {
    const h = e.healthPct;
    const sev: Severity = h < 50 ? "CRITICAL" : h < 70 ? "WARNING" : h < 85 ? "ADVISORY" : "NOMINAL";
    if (sev === "NOMINAL") continue;
    out.push({
      key: `EQUIP:${e.id}`,
      rule: "EQUIPMENT",
      cause: EQUIP_CAUSE[e.type] ?? "EQUIPMENT_DEGRADATION",
      roomId: e.roomId,
      metric: "EQUIPMENT_HEALTH",
      sev,
      occupied: true,
      title: e.status === "FAILED" ? `${e.name} has failed` : `${e.name} needs service`,
      message: `${e.name} at ${Math.round(h)}% health.`,
    });
  }
  return out;
}

/** Floor-plan severity of one room from its own readings (uncapped). */
export function roomRawSeverity(r: SimRoom, zoneConds: { rule: string; sev: Severity }[]): Severity {
  let sev: Severity = "NOMINAL";
  for (const c of zoneConds) if (c.rule !== "EQUIPMENT" && c.rule !== "DOSE") sev = maxSev(sev, c.sev);
  sev = maxSev(sev, above(r.dose, T.DOSE));
  return sev;
}

export const sevAtLeast = (s: Severity, min: Severity) => sevRank(s) >= sevRank(min);
