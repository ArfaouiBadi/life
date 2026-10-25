import type { Id, ScenarioRequest, TelemetrySnapshot, WorkOrder } from "@/api/contracts";
import { sevRank } from "@/api/contracts";
import { SOL_S, isNight, lmstAt, marsTime } from "@/lib/marsTime";
import { gaussian, mulberry32, type Rng } from "./rng";
import { Ring } from "./ring";
import { NOISE, PHYS } from "./physics/constants";
import { roomsOfZone, stepAtmosphere, zonesOf, type AtmoContext } from "./physics/atmosphere";
import { loadKW, solarKW } from "./physics/power";
import { speMultiplier } from "./physics/radiation";
import { netLossLps } from "./physics/water";
import { recycleOf } from "./predict/predictions";
import { addEvent, detectHome, isoAt } from "./detect/incidents";
import { stepRuns } from "./playbooks/runner";
import { addRegional, injectScenario, secondsUntilLocalTime } from "./scenarios";
import { generateWorld, newId } from "./world/generateWorld";
import { sendToBed, stepOccupants } from "./world/occupants";
import { newOutbox, type Outbox } from "./outbox";
import { dispatchDto, fleetStatus, fleetSummary, homeSummary, incidentDto, regionalDto, telemetry } from "./dto";
import type { SimEquipment, SimHome, World } from "./world/types";

export const MAX_SUBSTEP_S = 10;
export const SNAPSHOT_CAP = 1800;
export const MAX_WATCHED = 20;

export interface Bus {
  publish(topic: string, msg: unknown): void;
  watchedHomeIds(): Set<Id>;
  setUplink(down: boolean): void;
}

/** Advances the world by dt sim-seconds. Free of React and timers so it can be unit tested (and ported to Java). */
export function stepWorld(w: World, dt: number, rng: Rng) {
  w.t += dt;
  const nowMs = w.epochMs + w.t * 1000;

  // Regional events drive dust and dose per settlement.
  for (const s of w.settlements) {
    s.doseMultiplier = 1;
    s.dustTau = 0.5;
  }
  for (const ev of w.regionalEvents) {
    for (const id of ev.settlementIds) {
      const s = w.settlements.find((x) => x.id === id)!;
      if (ev.kind === "SOLAR_PARTICLE_EVENT") {
        ev.intensity = speMultiplier(ev, w.t);
        s.doseMultiplier = Math.max(s.doseMultiplier, ev.intensity);
      } else s.dustTau = Math.max(s.dustTau, ev.intensity);
    }
  }

  const lmstBy = new Map(w.settlements.map((s) => [s.id, lmstAt(nowMs, s.lon)]));
  const settlementBy = new Map(w.settlements.map((s) => [s.id, s]));
  for (const h of w.homes) {
    const s = settlementBy.get(h.settlementId)!;
    const lmst = lmstBy.get(h.settlementId)!;
    stepOccupants(h, dt, w.t, lmst, rng);

    const inRoom = new Map<Id, number>();
    for (const o of h.occupants) if (o.roomId !== null) inRoom.set(o.roomId, (inRoom.get(o.roomId) ?? 0) + 1);
    const { gen, scrub, solar } = gear(h);
    const ctx: AtmoContext = {
      occupantsInRoom: inRoom,
      o2GenRoomId: gen.roomId,
      o2GenCapacityPeople: h.template === "FAMILY" ? 6 : 3,
      o2GenHealth: gen.status === "FAILED" ? 0 : gen.healthPct / 100,
      scrubberRoomId: scrub.roomId,
      scrubberHealth: scrub.status === "FAILED" ? 0 : scrub.healthPct / 100,
    };
    stepAtmosphere(h, dt, ctx);
    for (const r of h.rooms) r.dose = PHYS.BASE_DOSE_USVH * s.doseMultiplier * r.shielding;

    // Power
    h.solarKW = solarKW(h.solarPeakKW, lmst, s.dustTau, solar.healthPct / 100);
    h.loadKW = loadKW(h.template, lmst, h.loadsShed);
    h.batteryKWh = Math.min(h.batteryCapKWh, Math.max(0, h.batteryKWh + ((h.solarKW - h.loadKW) * dt) / 3600));

    // Water
    h.waterTankL = Math.max(0, h.waterTankL - netLossLps(h.occupants.length, h.waterUseLSol, recycleOf(h)) * dt);

    // Wear
    for (const e of h.equipment) {
      if (e.status === "FAILED") continue;
      e.healthPct = Math.max(0, e.healthPct - (e.degradePerSol * dt) / SOL_S);
      e.status = e.healthPct < 50 ? "DEGRADED" : "OK";
    }

    // Sensors: one published sample per zone (pressure is shared across a zone).
    if (h.link !== "OFFLINE") {
      for (const z of zonesOf(h)) {
        const rs = roomsOfZone(h, z);
        const r0 = rs[0];
        let dose = 0;
        for (const r of rs) if (r.dose > dose) dose = r.dose;
        const sample = {
          t: w.t,
          p: r0.pN2 + r0.ppO2 + gaussian(rng, NOISE.pressure),
          o2: r0.ppO2 + gaussian(rng, NOISE.ppO2),
          co2: r0.co2 + gaussian(rng, NOISE.co2),
          smoke: r0.smoke,
          dose,
        };
        for (const r of rs) r.history.push(sample);
      }
    }
  }

  for (const d of w.dispatches) {
    if (d.status === "PREPARING") {
      d.prepLeftS -= dt;
      if (d.prepLeftS <= 0) d.status = "EN_ROUTE";
    } else if (d.status === "EN_ROUTE") {
      d.progress = Math.min(1, d.progress + (5 * dt) / d.lengthM);
      if (d.progress >= 1) {
        d.status = "ON_SITE";
        d.onSiteAt = w.t;
      }
    }
    d.etaSeconds = d.status === "PREPARING" ? d.prepLeftS + d.lengthM / 5 : d.status === "EN_ROUTE" ? ((1 - d.progress) * d.lengthM) / 5 : 0;
  }
}

const gearCache = new WeakMap<SimHome, { gen: SimEquipment; scrub: SimEquipment; solar: SimEquipment }>();
function gear(h: SimHome) {
  let g = gearCache.get(h);
  if (!g) {
    const by = (t: string) => h.equipment.find((e) => e.type === t)!;
    g = { gen: by("O2_GENERATOR"), scrub: by("CO2_SCRUBBER"), solar: by("SOLAR_ARRAY") };
    gearCache.set(h, g);
  }
  return g;
}

export class SimEngine {
  w!: World;
  private rng!: Rng; // physics and sensors
  private noise!: Rng; // published telemetry only, so watching a home never changes the world
  private timer: ReturnType<typeof setInterval> | null = null;
  private bus: Bus;
  private wasUplinkDown = false;
  private lastNeeding = new Map<Id, number>();
  private listeners = new Set<() => void>();
  readonly autoRunSec: number;

  constructor(bus: Bus, seed: number, epochMs = Date.now(), autoRunSec = 20) {
    this.bus = bus;
    this.autoRunSec = autoRunSec;
    this.reset(seed, epochMs);
  }

  reset(seed = this.w?.seed ?? 2061, epochMs = Date.now()) {
    this.w = generateWorld(seed, epochMs);
    this.rng = mulberry32(seed ^ 0x5bd1e995);
    this.noise = mulberry32(seed ^ 0x9e3779b9);
    const w = this.w;
    const ox = newOutbox();
    const arc = w.settlements.find((s) => s.code === "ARC")!;
    addRegional(w, ox, {
      kind: "DUST_STORM",
      settlementIds: [arc.id],
      intensity: 1.2,
      baseIntensity: 1.2,
      expectedEndAt: null,
      rampUntil: Infinity,
      holdUntil: Infinity,
      decayUntil: Infinity,
    });
    this.seedWorkOrders();
    // Warm the sensors for a minute so fits have data, then let detection see the baseline.
    for (let i = 0; i < 6; i++) stepWorld(w, 10, this.rng);
    for (const h of w.homes) {
      this.heartbeat(h);
      detectHome(w, h, this.rng, ox, false);
    }
    // The previous shift already acknowledged the baseline issues.
    for (const inc of w.incidents) {
      if (inc.status !== "DETECTED" || inc.type === "HOME_OFFLINE") continue;
      inc.status = "ACKNOWLEDGED";
      inc.acknowledgedAt = isoAt(w);
      inc.assignee = "Omar Farouk";
      const run = w.runs.find((r) => r.id === inc.runId);
      if (run) {
        run.autoRunAt = null;
        run.autoRunTick = null;
      }
      addEvent(w, inc, "ACKNOWLEDGED", "Omar Farouk", "Acknowledged during the previous shift. Technician booked.", ox);
    }
    this.notify();
  }

  start() {
    if (!this.timer) this.timer = setInterval(() => this.tick(), 1000);
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
  onTick(cb: () => void) {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  }
  private notify() {
    for (const cb of this.listeners) cb();
  }

  get uplinkDown() {
    return this.w.uplinkDownUntilTick !== null && this.w.tick < this.w.uplinkDownUntilTick;
  }

  tick() {
    const w = this.w;
    const t0 = performance.now();
    w.tick++;
    const total = w.speed;
    const n = Math.ceil(total / MAX_SUBSTEP_S);
    for (let i = 0; i < n; i++) stepWorld(w, total / n, this.rng);

    const ox = newOutbox();
    const watched = this.watched();
    for (const h of w.homes) {
      this.heartbeat(h);
      detectHome(w, h, this.rng, ox, watched.has(h.id));
    }
    stepRuns(w, ox, this.rng);
    this.updateRegionalCounts(ox);
    for (const d of w.dispatches) if (d.status === "EN_ROUTE" || d.status === "PREPARING") ox.dispatches.push(dispatchDto(d));

    const down = this.uplinkDown;
    if (down !== this.wasUplinkDown) {
      this.bus.setUplink(down);
      this.wasUplinkDown = down;
    }
    this.publish(ox, watched);
    this.lastTickMs = performance.now() - t0;
    this.notify();
  }
  lastTickMs = 0;

  private heartbeat(h: SimHome) {
    const w = this.w;
    if (h.gatewayOfflineUntilTick !== null && w.tick >= h.gatewayOfflineUntilTick) h.gatewayOfflineUntilTick = null;
    if (h.gatewayOfflineUntilTick === null) h.lastHeartbeatTick = w.tick;
    h.link = w.tick - h.lastHeartbeatTick > 15 ? "OFFLINE" : "ONLINE";
  }

  watched(): Set<Id> {
    const ids = [...this.bus.watchedHomeIds()];
    for (const i of this.w.incidents) if (i.status !== "RESOLVED" && i.homeId !== null) ids.push(i.homeId);
    return new Set(ids.slice(0, MAX_WATCHED));
  }

  private publish(ox: Outbox, watched: Set<Id>) {
    const w = this.w;
    const bus = this.bus;
    bus.publish("/topic/sim/clock", { simTime: isoAt(w), speed: w.speed });
    for (const id of watched) {
      const h = w.homeById.get(id)!;
      if (h.link === "OFFLINE") continue;
      const snap = telemetry(w, h, this.noise, recycleOf(h));
      h.snapshots ??= new Ring<TelemetrySnapshot>(SNAPSHOT_CAP);
      h.snapshots.push(snap);
      bus.publish(`/topic/homes/${id}/telemetry`, snap);
      bus.publish(`/topic/homes/${id}/predictions`, h.predictions);
    }
    if (w.tick % 2 === 0) bus.publish("/topic/fleet/status", fleetStatus(w));
    if (w.tick % 5 === 0) bus.publish("/topic/fleet/summary", fleetSummary(w, this.uplinkDown));
    for (const a of ox.alerts) bus.publish("/topic/alerts", a);
    for (const i of ox.incidents) bus.publish("/topic/incidents", i);
    for (const r of dedupe(ox.runs)) bus.publish("/topic/playbook-runs", r);
    for (const d of dedupe(ox.dispatches)) bus.publish("/topic/dispatches", d);
    for (const e of ox.regional) bus.publish("/topic/regional-events", e);
  }

  private updateRegionalCounts(ox: Outbox) {
    const w = this.w;
    const ended = w.regionalEvents.filter((e) => e.expectedEndAt !== null && Date.parse(e.expectedEndAt) <= w.epochMs + w.t * 1000);
    for (const e of ended) ox.regional.push({ ...regionalDto(e), intensity: 0 });
    w.regionalEvents = w.regionalEvents.filter((e) => !ended.includes(e));
    for (const e of w.regionalEvents) {
      const cause = e.kind === "DUST_STORM" ? "POWER_DEFICIT" : "RADIATION_EVENT";
      let needing = 0;
      for (const h of w.homes) {
        if (!e.settlementIds.includes(h.settlementId)) continue;
        for (const c of h.conds.values())
          if (c.cause === cause && sevRank(c.sev) >= sevRank("CRITICAL")) {
            needing++;
            break;
          }
      }
      e.homesNeedingAction = needing;
      const changed = this.lastNeeding.get(e.id) !== needing;
      if (changed || e.kind === "SOLAR_PARTICLE_EVENT") {
        this.lastNeeding.set(e.id, needing);
        if (changed || w.tick % 5 === 0) ox.regional.push(regionalDto(e));
      }
    }
  }

  private seedWorkOrders() {
    const w = this.w;
    const sol = marsTime(new Date(w.epochMs)).sol;
    for (const h of w.homes)
      for (const e of h.equipment) {
        if (e.healthPct >= 85) continue;
        const wo: WorkOrder = {
          id: newId(w, "workOrder"),
          code: `WO-${String(w.nextId.workOrder).padStart(4, "0")}`,
          homeId: h.id,
          equipmentId: e.id,
          title: `Service ${e.name.toLowerCase().replace("co₂", "CO₂")}`,
          reason: "PREDICTIVE",
          dueSol: sol + Math.max(1, Math.round((e.healthPct - 60) / Math.max(0.5, e.degradePerSol * 8))),
          status: e.healthPct < 70 ? "SCHEDULED" : "NEW",
          assignee: e.healthPct < 70 ? "Kenji Sato" : null,
          healthTrend: Array.from({ length: 12 }, (_, i) => ({
            sol: sol - 11 + i,
            healthPct: +(e.healthPct + (11 - i) * e.degradePerSol * (e.healthPct < 70 ? 6 : 3)).toFixed(1),
          })),
        };
        w.workOrders.push(wo);
      }
    w.workOrders.sort((a, b) => a.dueSol - b.dueSol);
  }

  // ---- Commands used by MockApi --------------------------------------------------------------

  setSpeed(speed: World["speed"]) {
    this.w.speed = speed;
  }

  setLocalTime(settlementId: Id, lmstHours: number) {
    const w = this.w;
    const s = w.settlements.find((x) => x.id === settlementId)!;
    const jump = secondsUntilLocalTime(lmstAt(w.epochMs + w.t * 1000, s.lon), lmstHours);
    w.t += jump;
    const nowMs = w.epochMs + w.t * 1000;
    for (const h of w.homes) {
      h.batteryTtdAt = -Infinity;
      const set = w.settlements.find((x) => x.id === h.settlementId)!;
      if (isNight(lmstAt(nowMs, set.lon))) sendToBed(h, this.rng);
    }
    this.publishNow();
  }

  inject(req: ScenarioRequest) {
    const ox = newOutbox();
    injectScenario(this.w, req, ox);
    this.publish(ox, new Set());
  }

  /** Push fresh status right away (after a command) instead of waiting for the next tick. */
  publishNow() {
    this.bus.publish("/topic/sim/clock", { simTime: isoAt(this.w), speed: this.w.speed });
    this.bus.publish("/topic/fleet/status", fleetStatus(this.w));
    this.bus.publish("/topic/fleet/summary", fleetSummary(this.w, this.uplinkDown));
  }

  flush(ox: Outbox) {
    this.publish(ox, new Set());
  }

  summaryOf(id: Id) {
    return homeSummary(this.w.homeById.get(id)!);
  }
  incidentDtoOf(id: Id) {
    return incidentDto(this.w.incidents.find((i) => i.id === id)!);
  }
}

function dedupe<T extends { id: Id }>(xs: T[]): T[] {
  const m = new Map<Id, T>();
  for (const x of xs) m.set(x.id, x);
  return [...m.values()];
}
