import type { Alert, Dispatch, Incident, IncidentEvent, PlaybookRun, RegionalEvent } from "@/api/contracts";

/** Change messages produced during one tick; the engine publishes them afterwards. */
export interface Outbox {
  alerts: { type: "CREATED" | "UPDATED" | "CLEARED"; alert: Alert }[];
  incidents: { incident: Incident; event?: IncidentEvent }[];
  runs: PlaybookRun[];
  dispatches: Dispatch[];
  regional: RegionalEvent[];
}

export const newOutbox = (): Outbox => ({ alerts: [], incidents: [], runs: [], dispatches: [], regional: [] });
