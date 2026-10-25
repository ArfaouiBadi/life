import type { Alert, Id, IncidentEvent, IncidentType, MetricKey, Prediction, Severity } from "@/api/contracts";
import { maxSev, sevRank } from "@/api/contracts";
import { gaussian, type Rng } from "../rng";
import type { Outbox } from "../outbox";
import { roomsOfZone, zonesOf } from "../physics/atmosphere";
import { SOL_S } from "@/lib/marsTime";
import { computePredictions, fitZones, headlineTtd, updateBatteryTtd, waterTtd } from "../predict/predictions";
import { playbookFor } from "../playbooks/definitions";
import { newId } from "../world/generateWorld";
import type { Cond, SimHome, SimIncident, SimRun, World } from "../world/types";
import { HYSTERESIS_S, evaluateHome, roomRawSeverity, type RawCond } from "./rules";
import { incidentDto, runDto } from "../dto";

export const MONITOR_RESOLVE_S = 300;
const REGIONAL_CAUSE: Partial<Record<IncidentType, "DUST_STORM" | "SOLAR_PARTICLE_EVENT">> = {
  POWER_DEFICIT: "DUST_STORM",
  RADIATION_EVENT: "SOLAR_PARTICLE_EVENT",
};
const CAUSE_METRICS: Record<IncidentType, MetricKey[]> = {
  PRESSURE_LOSS: ["PPO2_KPA"],
  CO2_BUILDUP: ["CO2_PPM"],
  FIRE: ["SMOKE_IDX", "PPO2_KPA"],
  POWER_DEFICIT: ["BATTERY_KWH"],
  RADIATION_EVENT: ["DOSE_USVH"],
  WATER_SHORTAGE: ["WATER_L"],
  EQUIPMENT_DEGRADATION: [],
  HOME_OFFLINE: [],
};

export const isoAt = (w: World, t = w.t) => new Date(w.epochMs + t * 1000).toISOString();

/** Published ultrasonic leak signal: 0.6–1.0 in a breached room, about 0.02 elsewhere. */
function publishAcoustic(home: SimHome, rng: Rng) {
  const m = new Map<Id, number>();
  for (const r of home.rooms) {
    const cm2 = r.leakAreaM2 * 1e4;
    // Quiet rooms: uniform hiss around 0.02 (cheaper than a Gaussian, and nobody fits on it).
    r.acoustic = cm2 > 0 ? Math.min(1, 0.6 + 0.4 * Math.min(1, cm2 / 5) + gaussian(rng, 0.02)) : 0.008 + rng() * 0.024;
    m.set(r.id, r.acoustic);
  }
  return m;
}

export function addEvent(w: World, inc: SimIncident, kind: IncidentEvent["kind"], actor: string, text: string, ox: Outbox) {
  const ev: IncidentEvent = { id: newId(w, "event"), incidentId: inc.id, ts: isoAt(w), kind, actor, text };
  inc.events.push(ev);
  ox.incidents.push({ incident: incidentDto(inc), event: ev });
  return ev;
}

export function detectHome(w: World, home: SimHome, rng: Rng, ox: Outbox, watched: boolean) {
  if (home.link === "OFFLINE") {
    syncOffline(w, home, ox, true);
    return;
  }
  syncOffline(w, home, ox, false);

  const busy = watched || sevRank(home.severity) > 0;
  if (!busy && home.conds.size === 0 && isQuiet(home, w)) {
    // Fast path: every reading sits comfortably inside its limits, so no rule can fire.
    home.ttdSeconds = null;
    home.predictions = [];
    return;
  }
  const acoustic = publishAcoustic(home, rng);
  const fits = fitZones(home, w, acoustic, busy);
  updateBatteryTtd(home, w);
  const leaking = fits.some((f) => f.kP !== null && f.kP > 5e-6 && f.r2P > 0.8);
  const preds = computePredictions(home, w, fits, busy || leaking);
  const raw = evaluateHome(home, w, fits, preds);
  updateConds(w, home, raw, ox);

  // Floor-plan severity per room (uncapped), with hysteresis.
  const zoneOf = new Map<Id, Id[]>();
  for (const z of zonesOf(home)) for (const id of z.roomIds) zoneOf.set(id, z.roomIds);
  const conds = [...home.conds.values()];
  for (const r of home.rooms) {
    const zone = zoneOf.get(r.id) ?? [r.id];
    const zoneConds = conds.filter((c) => c.roomId !== null && zone.includes(c.roomId));
    r.severity = hysteresis(w, r, roomRawSeverity(r, zoneConds));
  }

  // Home severity: occupied zones and systems count fully; empty zones are capped at warning.
  let sev: Severity = "NOMINAL";
  for (const c of conds) sev = maxSev(sev, c.occupied ? c.sev : sevRank(c.sev) > sevRank("WARNING") ? "WARNING" : c.sev);
  home.severity = sev;
  home.predictions = preds;
  home.ttdSeconds = headlineTtd(preds);

  syncAlerts(w, home, ox);
  syncIncidents(w, home, preds, ox);
}

/** True when no detection rule could trigger: margins below every warning threshold. */
function isQuiet(home: SimHome, w: World): boolean {
  for (const z of zonesOf(home)) {
    const rs = roomsOfZone(home, z);
    const s = rs[0].history.last();
    if (!s) return false;
    if (s.o2 < 20 || s.co2 > 2000 || s.smoke > 5 || s.dose > 25) return false;
    if (rs[0].tempC > 28 || rs[0].tempC < 17) return false;
    if (Math.abs(s.p - (rs[0].history.at(Math.max(0, rs[0].history.length - 60)).p)) > 0.08) return false;
  }
  for (const e of home.equipment) if (e.healthPct < 86) return false;
  updateBatteryTtd(home, w);
  if (home.batteryTtd !== null && home.batteryTtd < 30 * 3600) return false;
  const wt = waterTtd(home);
  if (wt !== null && wt < 15 * SOL_S) return false;
  return true;
}

function hysteresis(w: World, s: { severity: Severity; downSince: number | null }, raw: Severity): Severity {
  if (sevRank(raw) >= sevRank(s.severity)) {
    s.downSince = null;
    return raw;
  }
  if (s.downSince === null) s.downSince = w.t;
  if (w.t - s.downSince >= HYSTERESIS_S) {
    s.downSince = null;
    return raw;
  }
  return s.severity;
}

function updateConds(w: World, home: SimHome, raw: RawCond[], ox: Outbox) {
  const seen = new Set<string>();
  for (const r of raw) {
    seen.add(r.key);
    const c = home.conds.get(r.key);
    if (!c) {
      home.conds.set(r.key, { ...r, downSince: null, alertId: null });
      continue;
    }
    const h = { severity: c.sev, downSince: c.downSince };
    c.sev = hysteresis(w, h, r.sev);
    c.downSince = h.downSince;
    Object.assign(c, { title: r.title, message: r.message, roomId: r.roomId, occupied: r.occupied, cause: r.cause });
  }
  for (const [key, c] of home.conds) {
    if (seen.has(key)) continue;
    const h = { severity: c.sev, downSince: c.downSince };
    c.sev = hysteresis(w, h, "NOMINAL");
    c.downSince = h.downSince;
    if (c.sev !== "NOMINAL") continue;
    home.conds.delete(key);
    const a = w.alerts.find((x) => x.id === c.alertId);
    if (a && !a.clearedAt) {
      a.clearedAt = isoAt(w);
      ox.alerts.push({ type: "CLEARED", alert: { ...a } });
    }
  }
}

function syncAlerts(w: World, home: SimHome, ox: Outbox) {
  for (const c of home.conds.values()) {
    const loud = sevRank(c.sev) >= sevRank("WARNING");
    if (loud && c.alertId === null) {
      const a: Alert = {
        id: newId(w, "alert"),
        code: `ALR-${String(w.nextId.alert).padStart(5, "0")}`,
        homeId: home.id,
        roomId: c.roomId,
        incidentId: null,
        regionalEventId: null,
        severity: c.sev,
        metric: c.metric,
        title: c.title,
        message: c.message,
        createdAt: isoAt(w),
        acknowledgedAt: null,
        acknowledgedBy: null,
        clearedAt: null,
      };
      w.alerts.push(a);
      c.alertId = a.id;
      ox.alerts.push({ type: "CREATED", alert: { ...a } });
    } else if (c.alertId !== null) {
      const a = w.alerts.find((x) => x.id === c.alertId)!;
      if (!loud) {
        a.clearedAt = isoAt(w);
        c.alertId = null;
        ox.alerts.push({ type: "CLEARED", alert: { ...a } });
      } else if (a.severity !== c.sev || a.title !== c.title) {
        a.severity = c.sev;
        a.title = c.title;
        a.message = c.message;
        a.roomId = c.roomId;
        ox.alerts.push({ type: "UPDATED", alert: { ...a } });
      }
    }
  }
}

export const openIncidentFor = (w: World, homeId: Id, cause: IncidentType) =>
  w.incidents.find((i) => i.homeId === homeId && i.cause === cause && i.status !== "RESOLVED");

function syncIncidents(w: World, home: SimHome, preds: Prediction[], ox: Outbox) {
  const byCause = new Map<IncidentType, Cond[]>();
  for (const c of home.conds.values()) {
    if (sevRank(c.sev) < sevRank("WARNING")) continue;
    byCause.set(c.cause, [...(byCause.get(c.cause) ?? []), c]);
  }

  for (const [cause, conds] of byCause) {
    const sev = conds.reduce<Severity>((a, c) => maxSev(a, c.occupied ? c.sev : minSev(c.sev, "WARNING")), "NOMINAL");
    const lead = conds.reduce((a, c) => (sevRank(c.sev) > sevRank(a.sev) || (c.rule === "PRESSURE_FALLING" && a.rule !== "PRESSURE_FALLING") ? c : a));
    const ttd = causeTtd(preds, cause);
    const regionalKind = REGIONAL_CAUSE[cause];
    const regional = regionalKind
      ? w.regionalEvents.find((e) => e.kind === regionalKind && e.settlementIds.includes(home.settlementId))
      : undefined;
    let inc = openIncidentFor(w, home.id, cause);

    if (!inc) {
      if (regional && sevRank(sev) < sevRank("CRITICAL")) {
        // Folded into the regional event: one line instead of a hundred.
        for (const c of conds) {
          const a = w.alerts.find((x) => x.id === c.alertId);
          if (a && a.regionalEventId === null) {
            a.regionalEventId = regional.id;
            ox.alerts.push({ type: "UPDATED", alert: { ...a } });
          }
        }
        continue;
      }
      inc = createIncident(w, home, cause, sev, lead.title, ttd, regional?.id ?? null, ox);
    } else {
      if (sevRank(sev) > sevRank(inc.severity)) addEvent(w, inc, "ESCALATED", "System", `Escalated to ${sev.toLowerCase()}: ${lead.title}`, ox);
      const changed = inc.severity !== sev || inc.title !== lead.title || inc.ttdSeconds !== ttd || inc.status === "MONITORING";
      inc.severity = sev;
      inc.title = lead.title;
      inc.ttdSeconds = ttd;
      if (inc.status === "MONITORING") {
        inc.monitoringSince = null;
        inc.status = inc.runId !== null ? "MITIGATING" : inc.acknowledgedAt ? "ACKNOWLEDGED" : "DETECTED";
      }
      if (sevRank(sev) >= sevRank("CRITICAL") && inc.criticalSince === null) inc.criticalSince = w.t;
      if (sevRank(sev) < sevRank("CRITICAL")) inc.criticalSince = null;
      if (changed) ox.incidents.push({ incident: incidentDto(inc) });
    }
    for (const c of conds) {
      const a = w.alerts.find((x) => x.id === c.alertId);
      if (a && a.incidentId !== inc.id) {
        a.incidentId = inc.id;
        if (!inc.alertIds.includes(a.id)) inc.alertIds.push(a.id);
        ox.alerts.push({ type: "UPDATED", alert: { ...a } });
      }
    }
  }

  // Incidents whose cause has gone quiet: monitor, then resolve.
  for (const inc of w.incidents) {
    if (inc.homeId !== home.id || inc.status === "RESOLVED" || inc.cause === "HOME_OFFLINE") continue;
    if (byCause.has(inc.cause)) continue;
    if (inc.status !== "MONITORING") {
      inc.status = "MONITORING";
      inc.monitoringSince = w.t;
      inc.ttdSeconds = null;
      addEvent(w, inc, "NOTE", "System", "Readings are back to normal. Watching for 5 minutes.", ox);
    } else if (w.t - (inc.monitoringSince ?? w.t) >= MONITOR_RESOLVE_S) {
      resolveIncident(w, inc, "System", "Stable for 5 minutes. Incident resolved.", ox);
    }
  }
}

const minSev = (a: Severity, b: Severity): Severity => (sevRank(a) <= sevRank(b) ? a : b);

function causeTtd(preds: Prediction[], cause: IncidentType): number | null {
  const metrics = CAUSE_METRICS[cause];
  let best: number | null = null;
  for (const p of preds) {
    if (!metrics.includes(p.metric) || !p.occupied || p.secondsToThreshold === null) continue;
    if (best === null || p.secondsToThreshold < best) best = p.secondsToThreshold;
  }
  return best;
}

export function createIncident(
  w: World,
  home: SimHome | null,
  cause: IncidentType,
  sev: Severity,
  title: string,
  ttd: number | null,
  regionalEventId: Id | null,
  ox: Outbox,
): SimIncident {
  const id = newId(w, "incident");
  const inc: SimIncident = {
    id,
    code: `INC-${String(id).padStart(4, "0")}`,
    homeId: home?.id ?? null,
    regionalEventId,
    type: cause,
    severity: sev,
    status: "DETECTED",
    title,
    ttdSeconds: ttd,
    startedAt: isoAt(w),
    acknowledgedAt: null,
    resolvedAt: null,
    assignee: null,
    settlementId: home?.settlementId ?? null,
    cause,
    monitoringSince: null,
    events: [],
    alertIds: [],
    runId: null,
    dispatchId: null,
    lastAckTick: null,
    criticalSince: sevRank(sev) >= sevRank("CRITICAL") ? w.t : null,
  };
  w.incidents.push(inc);
  addEvent(w, inc, "DETECTED", "System", title, ox);

  const pb = playbookFor(cause);
  if (pb && home) {
    const autoRunAfter = pb.autoRunAfterSec;
    const run: SimRun = {
      id: newId(w, "run"),
      incidentId: id,
      playbookCode: pb.code,
      status: "PENDING",
      autoRunAt: isoAt(w, w.t + autoRunAfter * w.speed),
      targetRoomId: null,
      targetRoomName: null,
      steps: pb.steps.map((s) => ({ code: s.code, status: "PENDING", startedAt: null, doneAt: null, actor: null })),
      actor: "System",
      homeAutopilot: false,
      autoRunTick: w.tick + autoRunAfter,
      autoRunSpeed: w.speed,
      stepStartedAt: w.t,
      watchSince: null,
    };
    w.runs.push(run);
    inc.runId = run.id;
    ox.runs.push(runDto(run));
  }
  return inc;
}

export function resolveIncident(w: World, inc: SimIncident, actor: string, text: string, ox: Outbox) {
  inc.status = "RESOLVED";
  inc.resolvedAt = isoAt(w);
  inc.ttdSeconds = null;
  addEvent(w, inc, "RESOLVED", actor, text, ox);
  const run = w.runs.find((r) => r.id === inc.runId);
  if (run && run.status !== "DONE") {
    for (const s of run.steps) if (s.status === "PENDING" || s.status === "RUNNING") s.status = "SKIPPED";
    run.status = "DONE";
    run.autoRunAt = null;
    run.autoRunTick = null;
    ox.runs.push(runDto(run));
  }
  for (const id of inc.alertIds) {
    const a = w.alerts.find((x) => x.id === id);
    if (a && !a.clearedAt) {
      a.clearedAt = isoAt(w);
      ox.alerts.push({ type: "CLEARED", alert: { ...a } });
    }
  }
  const home = inc.homeId !== null ? w.homeById.get(inc.homeId) : undefined;
  if (home && !w.incidents.some((i) => i.homeId === home.id && i.status !== "RESOLVED")) {
    for (const o of home.occupants) o.override = null;
    home.scrubSmoke = false;
    home.powerCutRoomId = null;
  }
}

function syncOffline(w: World, home: SimHome, ox: Outbox, offline: boolean) {
  const inc = openIncidentFor(w, home.id, "HOME_OFFLINE");
  if (offline && !inc) createIncident(w, home, "HOME_OFFLINE", "ADVISORY", "Home not reporting", null, null, ox);
  if (!offline && inc) resolveIncident(w, inc, "System", "Home is reporting again.", ox);
}
