// Internal state → contract DTOs. The only shapes that leave src/sim.
import type {
  Dispatch,
  Dome,
  FleetStatusMessage,
  FleetSummary,
  HomeDetail,
  HomeSummary,
  Incident,
  PlaybookRun,
  RegionalEvent,
  Severity,
  Settlement,
  TelemetrySnapshot,
} from "@/api/contracts";
import { maxSev } from "@/api/contracts";
import { gaussian, type Rng } from "./rng";
import { NOISE } from "./physics/constants";
import type { SimDispatch, SimDome, SimHome, SimIncident, SimRegionalEvent, SimRun, SimSettlement, World } from "./world/types";

const emptyCounts = (): Record<Severity, number> => ({ NOMINAL: 0, ADVISORY: 0, WARNING: 0, CRITICAL: 0, EMERGENCY: 0 });

export const roomSeverities = (h: SimHome) => h.rooms.map((r) => ({ roomCode: r.code, severity: r.severity }));

export function homeSummary(h: SimHome): HomeSummary {
  return {
    id: h.id,
    code: h.code,
    domeId: h.domeId,
    hexQ: h.hexQ,
    hexR: h.hexR,
    template: h.template,
    plan: h.plan,
    householdName: h.householdName,
    occupantCount: h.occupants.length,
    severity: h.severity,
    link: h.link,
    ttdSeconds: h.ttdSeconds,
    roomSeverities: roomSeverities(h),
  };
}

export function homeDetail(h: SimHome): HomeDetail {
  return {
    ...homeSummary(h),
    widthM: h.widthM,
    depthM: h.depthM,
    rooms: h.rooms.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      type: r.type,
      polygon: [
        [r.x, r.y],
        [r.x + r.w, r.y],
        [r.x + r.w, r.y + r.h],
        [r.x, r.y + r.h],
      ],
      volumeM3: r.volumeM3,
      hostsLifeSupport: r.hostsLifeSupport,
      isShelter: r.isShelter,
    })),
    hatches: h.hatches.map(({ id, code, roomAId, roomBId, x, y, orientation, widthM, state }) => ({
      id, code, roomAId, roomBId, x, y, orientation, widthM, state,
    })),
    occupants: h.occupants.map((o) => ({
      id: o.id,
      name: o.name,
      initials: o.initials,
      age: o.age,
      isHomeowner: o.isHomeowner,
      roomId: o.roomId,
    })),
    equipment: h.equipment.map((e) => ({ id: e.id, type: e.type, name: e.name, roomId: e.roomId, healthPct: e.healthPct, status: e.status })),
    batteryCapKWh: h.batteryCapKWh,
    solarPeakKW: h.solarPeakKW,
    waterTankCapL: h.waterTankCapL,
  };
}

/** Published readings: true state plus sensor noise. */
export function telemetry(w: World, h: SimHome, rng: Rng, recyclePct: number): TelemetrySnapshot {
  return {
    homeId: h.id,
    ts: new Date(w.epochMs + w.t * 1000).toISOString(),
    rooms: h.rooms.map((r) => ({
      roomId: r.id,
      pressureKPa: r.pN2 + r.ppO2 + gaussian(rng, NOISE.pressure),
      ppO2KPa: r.ppO2 + gaussian(rng, NOISE.ppO2),
      co2Ppm: r.co2 + gaussian(rng, NOISE.co2),
      tempC: r.tempC + gaussian(rng, NOISE.temp),
      humidityPct: r.humidity,
      smokeIdx: r.smoke,
      doseUSvH: r.dose,
      leakAcoustic: r.acoustic,
      severity: r.severity,
    })),
    power: { batteryKWh: h.batteryKWh, solarKW: h.solarKW, loadKW: h.loadKW, loadsShed: h.loadsShed },
    water: { tankL: h.waterTankL, recyclePct },
    o2ReservePct: h.o2ReservePct,
    hatches: h.hatches.map((x) => ({ id: x.id, state: x.state })),
    occupants: h.occupants.map((o) => ({ id: o.id, roomId: o.roomId, x: o.x, y: o.y })),
    equipment: h.equipment.map((e) => ({ id: e.id, healthPct: e.healthPct, status: e.status })),
  };
}

export function settlementDto(w: World, s: SimSettlement): Settlement {
  const homes = w.homes.filter((h) => h.settlementId === s.id);
  return {
    id: s.id,
    code: s.code,
    name: s.name,
    featureName: s.featureName,
    lat: s.lat,
    lon: s.lon,
    foundedYear: s.foundedYear,
    population: homes.reduce((a, h) => a + h.occupants.length, 0),
    domeCount: s.domeIds.length,
    homeCount: homes.length,
    worstSeverity: homes.reduce<Severity>((a, h) => maxSev(a, h.severity), "NOMINAL"),
    openIncidents: w.incidents.filter((i) => i.settlementId === s.id && i.status !== "RESOLVED").length,
    frameWidthM: s.frameWidthM,
    frameHeightM: s.frameHeightM,
  };
}

export function domeDto(w: World, d: SimDome): Dome {
  const counts = emptyCounts();
  let residents = 0;
  let offline = 0;
  for (const id of d.homeIds) {
    const h = w.homeById.get(id)!;
    counts[h.severity]++;
    residents += h.occupants.length;
    if (h.link === "OFFLINE") offline++;
  }
  return {
    id: d.id,
    code: d.code,
    name: d.name,
    settlementId: d.settlementId,
    centerX: d.centerX,
    centerY: d.centerY,
    radiusM: d.radiusM,
    homeCount: d.homeIds.length,
    residentCount: residents,
    severityCounts: counts,
    offlineCount: offline,
  };
}

export function incidentDto(i: SimIncident): Incident {
  return {
    id: i.id,
    code: i.code,
    homeId: i.homeId,
    regionalEventId: i.regionalEventId,
    type: i.type,
    severity: i.severity,
    status: i.status,
    title: i.title,
    ttdSeconds: i.ttdSeconds,
    startedAt: i.startedAt,
    acknowledgedAt: i.acknowledgedAt,
    resolvedAt: i.resolvedAt,
    assignee: i.assignee,
  };
}

export function runDto(r: SimRun): PlaybookRun {
  return {
    id: r.id,
    incidentId: r.incidentId,
    playbookCode: r.playbookCode,
    status: r.status,
    autoRunAt: r.autoRunAt,
    targetRoomId: r.targetRoomId,
    targetRoomName: r.targetRoomName,
    steps: r.steps.map((s) => ({ ...s })),
  };
}

export function dispatchDto(d: SimDispatch): Dispatch {
  return {
    id: d.id,
    incidentId: d.incidentId,
    settlementId: d.settlementId,
    crewCode: d.crewCode,
    roverCode: d.roverCode,
    crewNames: [...d.crewNames],
    path: d.path,
    progress: d.progress,
    etaSeconds: d.etaSeconds,
    status: d.status,
  };
}

export function regionalDto(e: SimRegionalEvent): RegionalEvent {
  return {
    id: e.id,
    code: e.code,
    kind: e.kind,
    settlementIds: [...e.settlementIds],
    intensity: e.intensity,
    startedAt: e.startedAt,
    expectedEndAt: e.expectedEndAt,
    affectedHomes: e.affectedHomes,
    homesNeedingAction: e.homesNeedingAction,
  };
}

export function fleetSummary(w: World, uplinkDown: boolean): FleetSummary {
  const by = emptyCounts();
  let offline = 0;
  let residents = 0;
  for (const h of w.homes) {
    by[h.severity]++;
    residents += h.occupants.length;
    if (h.link === "OFFLINE") offline++;
  }
  return {
    ts: new Date(w.epochMs + w.t * 1000).toISOString(),
    homes: w.homes.length,
    residents,
    bySeverity: by,
    offline,
    openIncidents: w.incidents.filter((i) => i.status !== "RESOLVED").length,
    regionalEvents: w.regionalEvents.map(regionalDto),
    uplink: uplinkDown ? "OFFLINE" : "ONLINE",
  };
}

export function fleetStatus(w: World): FleetStatusMessage {
  return {
    ts: new Date(w.epochMs + w.t * 1000).toISOString(),
    homes: w.homes.map((h) => ({
      id: h.id,
      severity: h.severity,
      link: h.link,
      ttdSeconds: h.ttdSeconds,
      roomSeverities: roomSeverities(h),
    })),
  };
}
