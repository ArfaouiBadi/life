import type { Id, IncidentType, WorkOrder } from "@/api/contracts";
import { sevRank } from "@/api/contracts";
import { homeWorldPos } from "@/lib/hex";
import { SOL_S, marsTime } from "@/lib/marsTime";
import { shuffle, type Rng } from "../rng";
import type { Outbox } from "../outbox";
import { PHYS, NOMINAL_PRESSURE } from "../physics/constants";
import { zonesOf } from "../physics/atmosphere";
import { fitExpDecay } from "../predict/regression";
import { zoneSamples, updateBatteryTtd, waterTtd } from "../predict/predictions";
import { addEvent, isoAt, resolveIncident } from "../detect/incidents";
import { dispatchDto, incidentDto, runDto } from "../dto";
import { newId } from "../world/generateWorld";
import { CREW_NAMES } from "../world/names";
import { SAFE_GATHER, SHELTER_ROOM } from "../world/templates";
import type { SimDispatch, SimHome, SimIncident, SimRoom, SimRun, World } from "../world/types";
import { fillRoom, playbookByCode } from "./definitions";

export class PlaybookError extends Error {}

type Ctx = { w: World; run: SimRun; inc: SimIncident; home: SimHome; ox: Outbox; rng: Rng };
type Progress = "DONE" | "WAIT" | "SKIP";

const roomById = (home: SimHome, id: Id | null) => home.rooms.find((r) => r.id === id) ?? null;
const roomByCode = (home: SimHome, code: string) => home.rooms.find((r) => r.code === code)!;
const peopleIn = (home: SimHome, roomId: Id | null) => home.occupants.filter((o) => o.roomId === roomId);

function causeQuiet(home: SimHome, cause: IncidentType) {
  for (const c of home.conds.values()) if (c.cause === cause && sevRank(c.sev) >= sevRank("WARNING")) return false;
  return true;
}

function sealRoom(w: World, home: SimHome, roomId: Id) {
  for (const h of home.hatches)
    if ((h.roomAId === roomId || h.roomBId === roomId) && h.roomBId !== null && h.state === "OPEN") h.state = "SEALED";
  splitZones(w, home);
}

export function splitZones(w: World, home: SimHome) {
  home.zones = null;
  for (const r of home.rooms) r.zoneSince = w.t;
  for (const o of home.occupants) o.path = [];
}

function reopenRoom(w: World, home: SimHome, roomId: Id) {
  const airlock = home.rooms.find((r) => r.type === "AIRLOCK")?.id;
  for (const h of home.hatches)
    if ((h.roomAId === roomId || h.roomBId === roomId) && h.roomBId !== null && h.roomAId !== airlock && h.roomBId !== airlock)
      h.state = "OPEN";
  splitZones(w, home);
}

function bookTechnician(ctx: Ctx, equipmentType: string, title: string) {
  const { w, home } = ctx;
  const e = home.equipment.find((x) => x.type === equipmentType) ?? null;
  const wo: WorkOrder = {
    id: newId(w, "workOrder"),
    code: `WO-${String(w.nextId.workOrder).padStart(4, "0")}`,
    homeId: home.id,
    equipmentId: e?.id ?? null,
    title,
    reason: "INCIDENT",
    dueSol: marsTime(new Date(w.epochMs + w.t * 1000)).sol + 1,
    status: "SCHEDULED",
    assignee: "Kenji Sato",
  };
  w.workOrders.unshift(wo);
}

/** Generic "watch for 5 minutes": the incident's cause stays below warning for 300 sim-s. */
function watchQuiet(ctx: Ctx, extra = true): Progress {
  const { w, run, home, inc } = ctx;
  if (causeQuiet(home, inc.cause) && extra) {
    run.watchSince ??= w.t;
    if (w.t - run.watchSince >= 300) return "DONE";
  } else run.watchSince = null;
  return "WAIT";
}

function zoneFitK(w: World, home: SimHome, roomId: Id) {
  const zone = zonesOf(home).find((z) => z.roomIds.includes(roomId))!;
  const fit = fitExpDecay(zoneSamples(home, zone, w.t).map((s) => ({ t: s.t, v: s.p })));
  return fit?.k ?? null;
}

const elapsed = (ctx: Ctx) => ctx.w.t - ctx.run.stepStartedAt;

// Each step: optional start effect, then progress until DONE / SKIP.
const STEPS: Record<string, { start?: (c: Ctx) => Progress | void; progress?: (c: Ctx) => Progress; confirm?: (c: Ctx) => void; applies?: (c: Ctx) => boolean }> = {
  "PB_BREACH:LOCATE": {
    progress: (c) => {
      if (elapsed(c) < 3) return "WAIT";
      const loudest = c.home.rooms.reduce((a, b) => (b.acoustic > a.acoustic ? b : a));
      c.run.targetRoomId = loudest.id;
      c.run.targetRoomName = loudest.name;
      return "DONE";
    },
  },
  "PB_BREACH:CLEAR_ROOM": {
    start: (c) => evacuate(c),
    progress: (c) => (peopleIn(c.home, c.run.targetRoomId).length === 0 || elapsed(c) >= 60 ? "DONE" : "WAIT"),
  },
  "PB_BREACH:SEAL_HATCH": { confirm: (c) => sealRoom(c.w, c.home, c.run.targetRoomId!) },
  "PB_BREACH:O2_BLEED": {
    start: (c) => {
      const target = lowOxygenZoneRoom(c);
      if (target === null) return "SKIP";
      c.home.o2BleedRoomId = target;
    },
    progress: (c) => {
      const r = roomById(c.home, c.home.o2BleedRoomId);
      if (!r || r.ppO2 >= 20.5 || c.home.o2ReservePct <= 0) {
        c.home.o2BleedRoomId = null;
        return "DONE";
      }
      return "WAIT";
    },
  },
  "PB_BREACH:DISPATCH": { confirm: (c) => createDispatch(c) },
  "PB_BREACH:PATCH": {
    progress: (c) => {
      const d = c.w.dispatches.find((x) => x.incidentId === c.inc.id);
      if (!d || d.onSiteAt === null || c.w.t - d.onSiteAt < 240) return "WAIT";
      for (const r of c.home.rooms) r.leakAreaM2 = 0;
      c.home.repressurizing = true;
      d.status = "DONE";
      c.ox.dispatches.push(dispatchDto(d));
      return "DONE";
    },
  },
  "PB_BREACH:VERIFY": {
    progress: (c) => {
      const room = roomById(c.home, c.run.targetRoomId)!;
      const k = zoneFitK(c.w, c.home, room.id);
      const steady = k !== null && k < 1e-6 && room.pN2 + room.ppO2 > NOMINAL_PRESSURE - 1;
      if (!steady) {
        c.run.watchSince = null;
        return "WAIT";
      }
      c.run.watchSince ??= c.w.t;
      if (c.w.t - c.run.watchSince < 300) return "WAIT";
      reopenRoom(c.w, c.home, room.id);
      c.home.repressurizing = false;
      return "DONE";
    },
  },

  "PB_CO2:CHECK_SCRUBBER": {
    progress: (c) => {
      if (elapsed(c) < 3) return "WAIT";
      const cond = [...c.home.conds.values()].find((x) => x.cause === "CO2_BUILDUP");
      const r = roomById(c.home, cond?.roomId ?? null);
      c.run.targetRoomId = r?.id ?? null;
      c.run.targetRoomName = r?.name ?? null;
      return "DONE";
    },
  },
  "PB_CO2:SPARE_CARTRIDGE": {
    confirm: (c) => {
      const e = c.home.equipment.find((x) => x.type === "CO2_SCRUBBER")!;
      e.healthPct = 95;
      e.status = "OK";
    },
  },
  "PB_CO2:OPEN_HATCH": {
    applies: (c) =>
      c.run.targetRoomId !== null &&
      c.home.hatches.some((h) => (h.roomAId === c.run.targetRoomId || h.roomBId === c.run.targetRoomId) && h.roomBId !== null && h.state === "SEALED" && roomById(c.home, h.roomAId)?.type !== "AIRLOCK"),
    confirm: (c) => reopenRoom(c.w, c.home, c.run.targetRoomId!),
  },
  "PB_CO2:BOOK_TECH": { start: (c) => bookTechnician(c, "CO2_SCRUBBER", "Replace CO₂ scrubber cartridge") },
  "PB_CO2:VERIFY": { progress: (c) => watchQuiet(c) },

  "PB_FIRE:CUT_POWER": {
    start: (c) => {
      const r = c.home.rooms.find((x) => x.fire) ?? roomById(c.home, firstCondRoom(c, "FIRE"));
      c.run.targetRoomId = r?.id ?? null;
      c.run.targetRoomName = r?.name ?? null;
      c.home.powerCutRoomId = r?.id ?? null;
    },
  },
  "PB_FIRE:SUPPRESS": {
    start: (c) => {
      for (const r of c.home.rooms)
        if (r.fire || r.id === c.run.targetRoomId) {
          r.fire = false;
          r.suppressed = true;
        }
    },
  },
  "PB_FIRE:SEAL_HATCH": { confirm: (c) => sealRoom(c.w, c.home, c.run.targetRoomId!) },
  "PB_FIRE:SHELTER": {
    start: (c) => toShelter(c),
    progress: (c) => (allInShelter(c) || elapsed(c) >= 120 ? "DONE" : "WAIT"),
  },
  "PB_FIRE:SCRUB_AIR": { start: (c) => void (c.home.scrubSmoke = true) },
  "PB_FIRE:DISPATCH": { confirm: (c) => createDispatch(c) },
  "PB_FIRE:VERIFY": {
    progress: (c) => {
      const p = watchQuiet(c);
      if (p === "DONE" && c.run.targetRoomId !== null) {
        reopenRoom(c.w, c.home, c.run.targetRoomId);
        for (const r of c.home.rooms) r.suppressed = false;
        const d = c.w.dispatches.find((x) => x.incidentId === c.inc.id);
        if (d && d.status !== "DONE") {
          d.status = "DONE";
          c.ox.dispatches.push(dispatchDto(d));
        }
      }
      return p;
    },
  },

  "PB_POWER:SHED_LOADS": {
    confirm: (c) => {
      c.home.loadsShed = true;
      updateBatteryTtd(c.home, c.w, true);
    },
  },
  "PB_POWER:WATCH_SUNRISE": { progress: (c) => (c.home.batteryTtd === null ? "DONE" : "WAIT") },

  "PB_RADIATION:SHELTER": { start: (c) => toShelter(c) },
  "PB_RADIATION:CONFIRM_INSIDE": { progress: (c) => (allInShelter(c) ? "DONE" : "WAIT") },
  "PB_RADIATION:ALL_CLEAR": {
    confirm: (c) => {
      const s = c.w.settlements.find((x) => x.id === c.home.settlementId)!;
      const dose = PHYS.BASE_DOSE_USVH * s.doseMultiplier;
      if (dose >= 30)
        throw new PlaybookError(`Outside the shelter the dose is still ${Math.round(dose)} µSv/h. Wait until it is below 30.`);
      for (const o of c.home.occupants) o.override = null;
    },
  },

  "PB_WATER:RESERVE_TANK": {
    confirm: (c) => {
      c.home.waterTankL = Math.min(c.home.waterTankCapL, c.home.waterTankL + c.home.waterTankCapL * 0.5);
    },
  },
  "PB_WATER:NOTICE": { start: (c) => void (c.home.waterUseLSol = 70) },
  "PB_WATER:BOOK_TECH": { start: (c) => bookTechnician(c, "WATER_RECYCLER", "Service water recycler") },
  "PB_WATER:WATCH_WATER": {
    progress: (c) => {
      const t = waterTtd(c.home);
      return t === null || t > 14 * SOL_S ? "DONE" : "WAIT";
    },
  },
};

function firstCondRoom(c: Ctx, cause: IncidentType) {
  return [...c.home.conds.values()].find((x) => x.cause === cause && x.roomId !== null)?.roomId ?? null;
}

function evacuate(c: Ctx) {
  const { home, run } = c;
  let gather = roomByCode(home, SAFE_GATHER[home.template]);
  if (gather.id === run.targetRoomId) gather = roomByCode(home, SHELTER_ROOM[home.template]);
  for (const o of peopleIn(home, run.targetRoomId)) {
    o.override = gather.id;
    o.path = [];
  }
}

function toShelter(c: Ctx) {
  const shelter = roomByCode(c.home, SHELTER_ROOM[c.home.template]);
  for (const o of c.home.occupants) {
    o.override = shelter.id;
    o.path = [];
  }
}
const allInShelter = (c: Ctx) => {
  const shelter = roomByCode(c.home, SHELTER_ROOM[c.home.template]);
  return c.home.occupants.every((o) => o.roomId === shelter.id);
};

function lowOxygenZoneRoom(c: Ctx): Id | null {
  const occupied = new Set(c.home.occupants.map((o) => o.roomId));
  for (const z of zonesOf(c.home)) {
    if (!z.roomIds.some((id) => occupied.has(id))) continue;
    const r = roomById(c.home, z.roomIds[0])!;
    const last = r.history.last();
    if (last && last.o2 < 19.5) return r.id;
  }
  return null;
}

export function createDispatch(c: Ctx): SimDispatch {
  const { w, home, inc, ox, rng } = c;
  const existing = w.dispatches.find((d) => d.incidentId === inc.id);
  if (existing) return existing;
  const s = w.settlements.find((x) => x.id === home.settlementId)!;
  const domes = w.domes.filter((d) => d.settlementId === s.id);
  const target = domes.find((d) => d.id === home.domeId)!;
  // Pad → nearest dome along the pad road, then through tunnels (BFS) to the home's dome.
  const nearest = domes.reduce((a, b) =>
    Math.hypot(a.centerX - s.landingPad[0], a.centerY - s.landingPad[1]) < Math.hypot(b.centerX - s.landingPad[0], b.centerY - s.landingPad[1]) ? a : b,
  );
  const prev = new Map<Id, Id>();
  const queue = [nearest.id];
  const seen = new Set([nearest.id]);
  while (queue.length) {
    const cur = queue.shift()!;
    for (const [a, b] of s.tunnels) {
      const next = a === cur ? b : b === cur ? a : null;
      if (next === null || seen.has(next)) continue;
      seen.add(next);
      prev.set(next, cur);
      queue.push(next);
    }
  }
  const chain: Id[] = [target.id];
  while (chain[0] !== nearest.id) chain.unshift(prev.get(chain[0])!);
  const path: [number, number][] = [s.landingPad];
  for (const id of chain) {
    const d = domes.find((x) => x.id === id)!;
    path.push([d.centerX, d.centerY]);
  }
  path.push(homeWorldPos({ ...target, homeCount: target.homeIds.length }, { q: home.hexQ, r: home.hexR }));
  let lengthM = 0;
  for (let i = 1; i < path.length; i++) lengthM += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);

  const busy = new Set(w.dispatches.filter((d) => d.settlementId === s.id && d.status !== "DONE").map((d) => d.roverCode));
  const rover = s.rovers.find((r) => !busy.has(r)) ?? s.rovers[0];
  const crew = shuffle(rng, [...CREW_NAMES]).slice(0, 2);
  const d: SimDispatch = {
    id: newId(w, "dispatch"),
    incidentId: inc.id,
    settlementId: s.id,
    crewCode: `CREW-${s.code}-${rover.slice(2)}`,
    roverCode: rover,
    crewNames: crew,
    path,
    progress: 0,
    etaSeconds: lengthM / 5 + 120,
    status: "PREPARING",
    prepLeftS: 120,
    onSiteAt: null,
    lengthM,
  };
  w.dispatches.push(d);
  inc.dispatchId = d.id;
  addEvent(w, inc, "DISPATCHED", c.run.actor, `${rover} dispatched with ${crew.join(" and ")}. Arrives in about ${Math.round(d.etaSeconds / 60)} minutes.`, ox);
  ox.dispatches.push(dispatchDto(d));
  return d;
}

/** Room-empty guard for sealing. Returns the names of people still inside. */
export function stillInside(home: SimHome, roomId: Id | null) {
  return peopleIn(home, roomId).map((o) => o.name.split(" ")[0]);
}

function ctxFor(w: World, run: SimRun, ox: Outbox, rng: Rng): Ctx | null {
  const inc = w.incidents.find((i) => i.id === run.incidentId)!;
  const home = inc.homeId !== null ? w.homeById.get(inc.homeId) : undefined;
  return home ? { w, run, inc, home, ox, rng } : null;
}

export function startRun(w: World, run: SimRun, actor: string, ox: Outbox, rng: Rng, text?: string) {
  const ctx = ctxFor(w, run, ox, rng);
  if (!ctx) throw new PlaybookError("This incident has no home to act on.");
  if (run.status !== "PENDING") return;
  run.status = "RUNNING";
  run.actor = actor;
  run.autoRunAt = null;
  run.autoRunTick = null;
  ctx.inc.status = "MITIGATING";
  addEvent(w, ctx.inc, actor === "Autopilot" ? "AUTOPILOT" : "STEP_STARTED", actor, text ?? `${playbookByCode(run.playbookCode).name} started.`, ox);
  advance(ctx);
}

/** Operator confirms a CONFIRM step (or runs the current step). */
export function confirmStep(w: World, run: SimRun, stepCode: string, actor: string, ox: Outbox, rng: Rng) {
  const ctx = ctxFor(w, run, ox, rng);
  if (!ctx) throw new PlaybookError("This incident has no home to act on.");
  if (run.status === "PENDING") startRun(w, run, actor, ox, rng);
  const idx = run.steps.findIndex((s) => s.code === stepCode);
  const current = run.steps.findIndex((s) => s.status === "PENDING" || s.status === "RUNNING");
  if (idx < 0) throw new PlaybookError(`Unknown step ${stepCode}.`);
  if (run.steps[idx].status === "DONE") return;
  if (idx !== current) throw new PlaybookError("Finish the earlier steps first.");
  const def = playbookByCode(run.playbookCode).steps[idx];
  if (def.mode !== "CONFIRM") return;
  doConfirm(ctx, idx, actor);
  advance(ctx);
}

function doConfirm(ctx: Ctx, idx: number, actor: string) {
  const { w, run, inc, ox } = ctx;
  const def = playbookByCode(run.playbookCode).steps[idx];
  const impl = STEPS[`${run.playbookCode}:${def.code}`];
  const s = run.steps[idx];
  s.status = "RUNNING";
  s.startedAt = isoAt(w);
  s.actor = actor;
  impl?.confirm?.(ctx);
  s.status = "DONE";
  s.doneAt = isoAt(w);
  addEvent(w, inc, "STEP_DONE", actor, fillRoom(def.doneText, run.targetRoomName), ox);
  run.stepStartedAt = w.t;
  run.watchSince = null;
}

/** Runs AUTO steps until one has to wait. */
function advance(ctx: Ctx) {
  const { w, run, inc, ox } = ctx;
  const pb = playbookByCode(run.playbookCode);
  for (let guard = 0; guard < 20; guard++) {
    const idx = run.steps.findIndex((s) => s.status === "PENDING" || s.status === "RUNNING");
    if (idx < 0) {
      run.status = "DONE";
      if (inc.status !== "RESOLVED") resolveIncident(w, inc, run.actor === "Autopilot" ? "Autopilot" : "System", `${pb.name} complete. ${fillRoom(pb.steps[pb.steps.length - 1].doneText, run.targetRoomName)}.`, ox);
      break;
    }
    const def = pb.steps[idx];
    const impl = STEPS[`${run.playbookCode}:${def.code}`];
    const s = run.steps[idx];
    const actor = run.homeAutopilot ? "Autopilot" : def.mode === "AUTO" ? "System" : run.actor;

    if (s.status === "PENDING" && impl?.applies && !impl.applies(ctx)) {
      s.status = "SKIPPED";
      continue;
    }
    if (def.mode === "CONFIRM") {
      const guardOk = !def.code.startsWith("SEAL") || stillInside(ctx.home, run.targetRoomId).length === 0;
      if (run.homeAutopilot && def.autopilot && guardOk) {
        try {
          doConfirm(ctx, idx, "Autopilot");
        } catch {
          break;
        }
        continue;
      }
      break; // waits for the operator
    }
    if (s.status === "PENDING") {
      s.status = "RUNNING";
      s.startedAt = isoAt(w);
      s.actor = actor;
      run.stepStartedAt = w.t;
      run.watchSince = null;
      if (impl?.start?.(ctx) === "SKIP") {
        s.status = "SKIPPED";
        s.doneAt = isoAt(w);
        continue;
      }
    }
    const p: Progress = impl?.progress ? impl.progress(ctx) : "DONE";
    if (p === "WAIT") break;
    s.status = p === "DONE" ? "DONE" : "SKIPPED";
    s.doneAt = isoAt(w);
    if (p === "DONE") addEvent(w, inc, "STEP_DONE", actor, fillRoom(def.doneText, run.targetRoomName), ox);
  }
  ox.runs.push(runDto(run));
  ox.incidents.push({ incident: incidentDto(inc) });
}

/** Called every tick: auto-run, home autopilot, and progress of running playbooks. */
export function stepRuns(w: World, ox: Outbox, rng: Rng) {
  const uplinkDown = w.uplinkDownUntilTick !== null && w.tick < w.uplinkDownUntilTick;
  for (const run of w.runs) {
    if (run.status === "DONE" || run.status === "FAILED") continue;
    const ctx = ctxFor(w, run, ox, rng);
    if (!ctx) continue;
    const { inc } = ctx;
    if (inc.status === "RESOLVED") continue;

    // Home autopilot: no acknowledgement 60 sim-s into an emergency (or a critical while the uplink is down).
    const serious = inc.criticalSince !== null && w.t - inc.criticalSince >= 60 && (inc.severity === "EMERGENCY" || uplinkDown);
    if (serious && !inc.acknowledgedAt && !run.homeAutopilot) {
      run.homeAutopilot = true;
      if (run.status === "PENDING") startRun(w, run, "Autopilot", ox, rng, "No operator response in 60 s. Home autopilot took over.");
      else addEvent(w, inc, "AUTOPILOT", "Autopilot", "No operator response in 60 s. Home autopilot took over.", ox);
    }

    // autoRunAt is a sim instant; keep it honest when the demo changes speed.
    if (run.status === "PENDING" && run.autoRunTick !== null && run.autoRunSpeed !== w.speed) {
      run.autoRunSpeed = w.speed;
      run.autoRunAt = isoAt(w, w.t + (run.autoRunTick - w.tick) * w.speed);
      ox.runs.push(runDto(run));
    }
    // Control-room auto-run after autoRunAfterSec real seconds without acknowledgement.
    if (run.status === "PENDING" && run.autoRunTick !== null && w.tick >= run.autoRunTick && !inc.acknowledgedAt && !uplinkDown) {
      const pb = playbookByCode(run.playbookCode);
      startRun(w, run, "Autopilot", ox, rng, `No operator response in ${pb.autoRunAfterSec} s. Playbook started automatically.`);
      continue;
    }
    if (run.status === "RUNNING") {
      const before = JSON.stringify(run.steps);
      advanceQuiet(ctx, before);
    }
  }
}

function advanceQuiet(ctx: Ctx, before: string) {
  const { ox } = ctx;
  const n = ox.runs.length;
  const m = ox.incidents.length;
  advance(ctx);
  if (JSON.stringify(ctx.run.steps) === before && ctx.run.status === "RUNNING") {
    ox.runs.length = n;
    ox.incidents.length = m;
  }
}

export const roomOf = (home: SimHome, id: Id | null): SimRoom | null => roomById(home, id);
