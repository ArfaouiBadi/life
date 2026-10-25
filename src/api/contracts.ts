// DTO types. These mirror the future Java DTOs exactly; change docs/API_CONTRACT.md in the same commit.
export type Id = number;
export type IsoInstant = string;

export type Severity = "NOMINAL" | "ADVISORY" | "WARNING" | "CRITICAL" | "EMERGENCY";
export type LinkState = "ONLINE" | "DEGRADED" | "OFFLINE";
export type Role =
  | "HOMEOWNER"
  | "HOUSEHOLD_MEMBER"
  | "OPERATOR"
  | "SUPERVISOR"
  | "TECHNICIAN"
  | "RESPONDER"
  | "ADMIN"
  | "INSURER";
export type PlanTier = "BASIC" | "FAMILY" | "PREMIUM" | "SETTLEMENT";
export type HomeTemplate = "POD" | "FAMILY";
export type RoomType = "LIVING" | "KITCHEN" | "BEDROOM" | "BATH" | "CORRIDOR" | "UTILITY" | "SAFE_ROOM" | "AIRLOCK";
export type HatchState = "OPEN" | "SEALED" | "FAULT";
export type EquipmentType =
  | "O2_GENERATOR"
  | "CO2_SCRUBBER"
  | "WATER_RECYCLER"
  | "BATTERY_BANK"
  | "SOLAR_ARRAY"
  | "HEATER"
  | "FIRE_SUPPRESSION";
export type EquipmentStatus = "OK" | "DEGRADED" | "FAILED" | "OFF";
export type MetricKey =
  | "PRESSURE_KPA"
  | "PPO2_KPA"
  | "CO2_PPM"
  | "TEMP_C"
  | "SMOKE_IDX"
  | "DOSE_USVH"
  | "BATTERY_KWH"
  | "WATER_L"
  | "EQUIPMENT_HEALTH";
export type IncidentType =
  | "PRESSURE_LOSS"
  | "CO2_BUILDUP"
  | "FIRE"
  | "POWER_DEFICIT"
  | "RADIATION_EVENT"
  | "WATER_SHORTAGE"
  | "EQUIPMENT_DEGRADATION"
  | "HOME_OFFLINE";
export type IncidentStatus = "DETECTED" | "ACKNOWLEDGED" | "MITIGATING" | "MONITORING" | "RESOLVED";

export interface Settlement {
  id: Id;
  code: string;
  name: string;
  featureName: string;
  lat: number;
  lon: number;
  foundedYear: number;
  population: number;
  domeCount: number;
  homeCount: number;
  worstSeverity: Severity;
  openIncidents: number;
  frameWidthM: number;
  frameHeightM: number;
}

export interface Dome {
  id: Id;
  code: string;
  name: string;
  settlementId: Id;
  centerX: number;
  centerY: number;
  radiusM: number;
  homeCount: number;
  residentCount: number;
  severityCounts: Record<Severity, number>;
  offlineCount: number;
}

export interface MapFeature {
  id: Id;
  settlementId: Id;
  kind: "TUNNEL" | "ROAD" | "LANDING_PAD" | "SOLAR_FARM" | "ICE_PLANT";
  name: string | null;
  points: [number, number][];
}

export interface HomeSummary {
  id: Id;
  code: string;
  domeId: Id;
  hexQ: number;
  hexR: number;
  template: HomeTemplate;
  plan: PlanTier;
  householdName: string;
  occupantCount: number;
  severity: Severity;
  link: LinkState;
  ttdSeconds: number | null;
  roomSeverities: { roomCode: string; severity: Severity }[];
}

export interface Room {
  id: Id;
  code: string;
  name: string;
  type: RoomType;
  polygon: [number, number][];
  volumeM3: number;
  hostsLifeSupport: boolean;
  isShelter: boolean;
}

export interface Hatch {
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

export interface Occupant {
  id: Id;
  name: string;
  initials: string;
  age: number;
  isHomeowner: boolean;
  roomId: Id | null;
}

export interface Equipment {
  id: Id;
  type: EquipmentType;
  name: string;
  roomId: Id | null;
  healthPct: number;
  status: EquipmentStatus;
}

export interface HomeDetail extends HomeSummary {
  widthM: number;
  depthM: number;
  rooms: Room[];
  hatches: Hatch[];
  occupants: Occupant[];
  equipment: Equipment[];
  batteryCapKWh: number;
  solarPeakKW: number;
  waterTankCapL: number;
}

export interface RoomReading {
  roomId: Id;
  pressureKPa: number;
  ppO2KPa: number;
  co2Ppm: number;
  tempC: number;
  humidityPct: number;
  smokeIdx: number;
  doseUSvH: number;
  leakAcoustic: number;
  severity: Severity;
}

export interface TelemetrySnapshot {
  homeId: Id;
  ts: IsoInstant;
  rooms: RoomReading[];
  power: { batteryKWh: number; solarKW: number; loadKW: number; loadsShed: boolean };
  water: { tankL: number; recyclePct: number };
  o2ReservePct: number;
  hatches: { id: Id; state: HatchState }[];
  occupants: { id: Id; roomId: Id | null; x: number; y: number }[];
  equipment: { id: Id; healthPct: number; status: EquipmentStatus }[];
}

export interface Prediction {
  id: string;
  homeId: Id;
  roomId: Id | null;
  zoneRoomIds: Id[];
  metric: MetricKey;
  current: number;
  threshold: number;
  secondsToThreshold: number | null;
  trend: "FALLING" | "RISING" | "STABLE";
  model: "EXP_DECAY_FIT" | "LINEAR_FIT" | "ENERGY_BALANCE";
  confidence: number;
  occupied: boolean;
  details: Record<string, number>;
  fitSeries?: { t: number; v: number }[];
  computedAt: IsoInstant;
}

export interface Alert {
  id: Id;
  code: string;
  homeId: Id | null;
  roomId: Id | null;
  incidentId: Id | null;
  regionalEventId: Id | null;
  severity: Severity;
  metric: MetricKey | null;
  title: string;
  message: string;
  createdAt: IsoInstant;
  acknowledgedAt: IsoInstant | null;
  acknowledgedBy: string | null;
  clearedAt: IsoInstant | null;
}

export interface Incident {
  id: Id;
  code: string;
  homeId: Id | null;
  regionalEventId: Id | null;
  type: IncidentType;
  severity: Severity;
  status: IncidentStatus;
  title: string;
  ttdSeconds: number | null;
  startedAt: IsoInstant;
  acknowledgedAt: IsoInstant | null;
  resolvedAt: IsoInstant | null;
  assignee: string | null;
}

export interface IncidentEvent {
  id: Id;
  incidentId: Id;
  ts: IsoInstant;
  kind:
    | "DETECTED"
    | "ESCALATED"
    | "ACKNOWLEDGED"
    | "STEP_STARTED"
    | "STEP_DONE"
    | "NOTE"
    | "DISPATCHED"
    | "AUTOPILOT"
    | "RESOLVED";
  actor: string;
  text: string;
}

export interface PlaybookStepDef {
  code: string;
  title: string;
  doneText: string;
  mode: "AUTO" | "MANUAL" | "CONFIRM";
  autopilot: boolean;
  residentText?: string;
}

export interface Playbook {
  code: string;
  incidentType: IncidentType;
  name: string;
  autoRunAfterSec: number;
  steps: PlaybookStepDef[];
}

export type StepStatus = "PENDING" | "RUNNING" | "DONE" | "SKIPPED" | "FAILED";

export interface PlaybookRun {
  id: Id;
  incidentId: Id;
  playbookCode: string;
  status: "PENDING" | "RUNNING" | "DONE" | "FAILED";
  autoRunAt: IsoInstant | null;
  targetRoomId: Id | null; // room the playbook acts on (located leak, fire room...)
  targetRoomName: string | null;
  steps: {
    code: string;
    status: StepStatus;
    startedAt: IsoInstant | null;
    doneAt: IsoInstant | null;
    actor: string | null;
  }[];
}

export interface Dispatch {
  id: Id;
  incidentId: Id;
  settlementId: Id;
  crewCode: string;
  roverCode: string;
  crewNames: string[];
  path: [number, number][];
  progress: number;
  etaSeconds: number;
  status: "PREPARING" | "EN_ROUTE" | "ON_SITE" | "DONE";
}

export interface RegionalEvent {
  id: Id;
  code: string;
  kind: "DUST_STORM" | "SOLAR_PARTICLE_EVENT";
  settlementIds: Id[];
  intensity: number;
  startedAt: IsoInstant;
  expectedEndAt: IsoInstant | null;
  affectedHomes: number;
  homesNeedingAction: number;
}

export interface FleetSummary {
  ts: IsoInstant;
  homes: number;
  residents: number;
  bySeverity: Record<Severity, number>;
  offline: number;
  openIncidents: number;
  regionalEvents: RegionalEvent[];
  uplink: LinkState;
}

export interface FleetStatusMessage {
  ts: IsoInstant;
  homes: {
    id: Id;
    severity: Severity;
    link: LinkState;
    ttdSeconds: number | null;
    roomSeverities: { roomCode: string; severity: Severity }[];
  }[];
}

export interface WorkOrder {
  id: Id;
  code: string;
  homeId: Id;
  equipmentId: Id | null;
  title: string;
  reason: "PREDICTIVE" | "INCIDENT" | "ROUTINE";
  dueSol: number;
  status: "NEW" | "SCHEDULED" | "IN_PROGRESS" | "DONE";
  assignee: string | null;
  healthTrend?: { sol: number; healthPct: number }[];
}

export interface Subscription {
  id: Id;
  homeId: Id;
  plan: PlanTier;
  monthlyPrice: number;
  startedAt: IsoInstant;
  status: "ACTIVE" | "TRIAL" | "PAST_DUE";
}

export interface Session {
  token: string;
  user: { id: Id; name: string; role: Role; homeId: Id | null };
}

export interface Page<T> {
  content: T[];
  page: { size: number; number: number; totalElements: number; totalPages: number };
}

export interface ScenarioRequest {
  kind:
    | "BREACH"
    | "SCRUBBER_FAILURE"
    | "FIRE"
    | "DUST_STORM"
    | "SOLAR_PARTICLE_EVENT"
    | "RECYCLER_FAILURE"
    | "GATEWAY_OFFLINE"
    | "UPLINK_LOST";
  homeId?: Id;
  roomId?: Id;
  settlementId?: Id;
  intensity?: number;
  durationSec?: number;
}

export const SEVERITY_ORDER: Severity[] = ["NOMINAL", "ADVISORY", "WARNING", "CRITICAL", "EMERGENCY"];
export const sevRank = (s: Severity) => SEVERITY_ORDER.indexOf(s);
export const maxSev = (a: Severity, b: Severity): Severity => (sevRank(a) >= sevRank(b) ? a : b);
