// Internal, mutable simulation state. Never handed to React directly: see sim/dto.ts.
import type {
  Alert,
  Dispatch,
  EquipmentStatus,
  EquipmentType,
  HatchState,
  HomeTemplate,
  Id,
  Incident,
  IncidentEvent,
  IncidentType,
  LinkState,
  MapFeature,
  MetricKey,
  PlanTier,
  PlaybookRun,
  Prediction,
  RegionalEvent,
  RoomType,
  Severity,
  Subscription,
  TelemetrySnapshot,
  WorkOrder,
} from "@/api/contracts";
import type { Ring } from "../ring";

export interface Sample {
  t: number; // sim seconds since epoch of the world
  p: number; // published total pressure, kPa
  o2: number; // published ppO2, kPa
  co2: number; // published CO2, ppm
  smoke: number;
  dose: number;
}

export interface SimRoom {
  id: Id;
  code: string;
  name: string;
  type: RoomType;
  x: number;
  y: number;
  w: number;
  h: number;
  volumeM3: number;
  hostsLifeSupport: boolean;
  isShelter: boolean;
  shielding: number;
  // true state
  pN2: number;
  ppO2: number;
  co2: number;
  tempC: number;
  humidity: number;
  smoke: number;
  dose: number;
  leakAreaM2: number;
  fire: boolean;
  suppressed: boolean;
  // sensors
  history: Ring<Sample>;
  zoneSince: number; // sim second the room's current zone formed; fits ignore older samples
  severity: Severity; // floor-plan severity, uncapped
  downSince: number | null;
  acoustic: number; // last published ultrasonic leak signal 0..1
}

export interface SimHatch {
  id: Id;
  code: string;
  roomAId: Id;
  roomBId: Id | null;
  x: number;
  y: number;
  orientation: "H" | "V";
  widthM: number;
  state: HatchState;
}

export interface SimOccupant {
  id: Id;
  name: string;
  initials: string;
  age: number;
  isHomeowner: boolean;
  bedRoomId: Id;
  roomId: Id | null;
  x: number;
  y: number;
  path: [number, number, Id][]; // waypoints with the room they lead into
  nextMoveAt: number;
  override: Id | null; // room the person was told to go to (evacuation, shelter)
}

export interface SimEquipment {
  id: Id;
  type: EquipmentType;
  name: string;
  roomId: Id | null;
  healthPct: number;
  status: EquipmentStatus;
  degradePerSol: number;
}

export interface Cond {
  key: string;
  rule: string;
  cause: IncidentType;
  roomId: Id | null;
  metric: MetricKey | null;
  sev: Severity;
  occupied: boolean;
  downSince: number | null;
  title: string;
  message: string;
  alertId: Id | null;
}

export interface Zone {
  roomIds: Id[];
  volumeM3: number;
}

export interface SimHome {
  id: Id;
  code: string;
  domeId: Id;
  settlementId: Id;
  hexQ: number;
  hexR: number;
  template: HomeTemplate;
  plan: PlanTier;
  householdName: string;
  widthM: number;
  depthM: number;
  rooms: SimRoom[];
  hatches: SimHatch[];
  occupants: SimOccupant[];
  equipment: SimEquipment[];
  batteryKWh: number;
  batteryCapKWh: number;
  solarPeakKW: number;
  solarKW: number;
  loadKW: number;
  loadsShed: boolean;
  waterTankL: number;
  waterTankCapL: number;
  waterUseLSol: number;
  o2ReservePct: number;
  o2BleedRoomId: Id | null;
  repressurizing: boolean;
  powerCutRoomId: Id | null;
  scrubSmoke: boolean;
  zones: Zone[] | null; // cached; null = recompute
  link: LinkState;
  gatewayOfflineUntilTick: number | null;
  lastHeartbeatTick: number;
  conds: Map<string, Cond>;
  severity: Severity;
  ttdSeconds: number | null;
  predictions: Prediction[];
  batteryTtd: number | null;
  batteryTtdAt: number;
  snapshots: Ring<TelemetrySnapshot> | null; // only while watched
  lastRoomSeverities: { roomCode: string; severity: Severity }[];
}

export interface SimDome {
  id: Id;
  code: string;
  name: string;
  settlementId: Id;
  centerX: number;
  centerY: number;
  radiusM: number;
  homeIds: Id[];
}

export interface SimSettlement {
  id: Id;
  code: string;
  name: string;
  featureName: string;
  lat: number;
  lon: number;
  foundedYear: number;
  blurb: string;
  domeIds: Id[];
  frameWidthM: number;
  frameHeightM: number;
  dustTau: number;
  doseMultiplier: number;
  landingPad: [number, number];
  tunnels: [Id, Id][]; // dome id pairs
  rovers: string[];
  craterRadiusM: number | null;
}

export interface SimRun extends PlaybookRun {
  actor: string; // who started it
  homeAutopilot: boolean;
  autoRunTick: number | null;
  autoRunSpeed: number; // speed autoRunAt was computed at
  stepStartedAt: number; // sim second current step began
  watchSince: number | null;
}

export interface SimIncident extends Incident {
  settlementId: Id | null;
  cause: IncidentType;
  monitoringSince: number | null;
  events: IncidentEvent[];
  alertIds: Id[];
  runId: Id | null;
  dispatchId: Id | null;
  lastAckTick: number | null;
  criticalSince: number | null;
}

export interface SimDispatch extends Dispatch {
  prepLeftS: number;
  onSiteAt: number | null;
  lengthM: number;
}

export interface SimRegionalEvent extends RegionalEvent {
  rampUntil: number;
  holdUntil: number;
  decayUntil: number;
  baseIntensity: number;
}

export interface World {
  seed: number;
  epochMs: number; // sim clock origin (real ms)
  t: number; // sim seconds since epoch
  tick: number; // real ticks since start (1 per real second)
  speed: 1 | 10 | 60 | 300;
  uplinkDownUntilTick: number | null;
  settlements: SimSettlement[];
  domes: SimDome[];
  homes: SimHome[];
  features: MapFeature[];
  alerts: Alert[];
  incidents: SimIncident[];
  runs: SimRun[];
  dispatches: SimDispatch[];
  regionalEvents: SimRegionalEvent[];
  workOrders: WorkOrder[];
  subscriptions: Subscription[];
  nextId: Record<string, number>;
  homeById: Map<Id, SimHome>;
  homeByCode: Map<string, SimHome>;
}
