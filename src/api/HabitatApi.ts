import type {
  Alert,
  Dispatch,
  Dome,
  FleetSummary,
  Hatch,
  HomeDetail,
  HomeSummary,
  Id,
  Incident,
  IncidentEvent,
  IsoInstant,
  MapFeature,
  Page,
  Playbook,
  PlaybookRun,
  Prediction,
  RegionalEvent,
  ScenarioRequest,
  Session,
  Settlement,
  Subscription,
  TelemetrySnapshot,
  WorkOrder,
} from "./contracts";

export interface IncidentBundle {
  incident: Incident;
  events: IncidentEvent[];
  alerts: Alert[];
  run: PlaybookRun | null;
  dispatch: Dispatch | null;
}

export interface HabitatApi {
  login(identityCode: string): Promise<Session>;
  getFleetSummary(): Promise<FleetSummary>;
  listSettlements(): Promise<Settlement[]>;
  getSettlementByCode(code: string): Promise<Settlement>;
  listDomes(settlementId: Id): Promise<Dome[]>;
  listMapFeatures(settlementId: Id): Promise<MapFeature[]>;
  listHomes(domeId: Id): Promise<HomeSummary[]>;
  getHomeByCode(code: string): Promise<HomeDetail>;
  getTelemetryHistory(homeId: Id, fromIso: IsoInstant, toIso: IsoInstant): Promise<TelemetrySnapshot[]>;
  listPredictions(homeId: Id): Promise<Prediction[]>;
  listAlerts(q: { open?: boolean; page?: number; size?: number }): Promise<Page<Alert>>;
  acknowledgeAlert(alertId: Id): Promise<Alert>;
  listIncidents(q: { open?: boolean }): Promise<Incident[]>;
  getIncidentByCode(code: string): Promise<IncidentBundle>;
  acknowledgeIncident(incidentId: Id): Promise<Incident>;
  addIncidentNote(incidentId: Id, text: string): Promise<IncidentEvent>;
  listPlaybooks(): Promise<Playbook[]>;
  startPlaybook(incidentId: Id): Promise<PlaybookRun>;
  executeStep(runId: Id, stepCode: string): Promise<PlaybookRun>;
  setHatchState(homeId: Id, hatchId: Id, state: "OPEN" | "SEALED"): Promise<Hatch>;
  dispatchCrew(incidentId: Id): Promise<Dispatch>;
  listRegionalEvents(): Promise<RegionalEvent[]>;
  listWorkOrders(): Promise<WorkOrder[]>;
  listSubscriptions(): Promise<Subscription[]>;
  sim: {
    injectScenario(req: ScenarioRequest): Promise<void>;
    setSpeed(multiplier: 1 | 10 | 60 | 300): Promise<void>;
    setLocalTime(settlementId: Id, lmstHours: number): Promise<void>;
    reset(seed?: number): Promise<void>;
  };
}
