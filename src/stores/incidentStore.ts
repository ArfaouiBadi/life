import { create } from "zustand";
import type { Alert, Dispatch, Id, Incident, IncidentEvent, PlaybookRun, RegionalEvent } from "@/api/contracts";

interface IncidentState {
  incidents: Record<Id, Incident>;
  events: Record<Id, IncidentEvent[]>; // by incident id
  alerts: Record<Id, Alert>;
  runs: Record<Id, PlaybookRun>; // by incident id
  dispatches: Record<Id, Dispatch>; // by incident id
  regional: Record<Id, RegionalEvent>;
  /** Things that happened while the uplink was down, shown once on reconnect. */
  backlog: IncidentEvent[];
  uplinkDown: boolean;
  seed: (p: { incidents: Incident[]; alerts: Alert[]; regional: RegionalEvent[] }) => void;
  upsertIncident: (i: Incident, ev?: IncidentEvent) => void;
  setEvents: (incidentId: Id, evs: IncidentEvent[]) => void;
  upsertAlert: (a: Alert) => void;
  upsertRun: (r: PlaybookRun) => void;
  upsertDispatch: (d: Dispatch) => void;
  upsertRegional: (e: RegionalEvent) => void;
  setUplinkDown: (down: boolean) => void;
  takeBacklog: () => IncidentEvent[];
}

export const useIncidentStore = create<IncidentState>((set, get) => ({
  incidents: {},
  events: {},
  alerts: {},
  runs: {},
  dispatches: {},
  regional: {},
  backlog: [],
  uplinkDown: false,
  seed: ({ incidents, alerts, regional }) =>
    set({
      incidents: Object.fromEntries(incidents.map((i) => [i.id, i])),
      alerts: Object.fromEntries(alerts.map((a) => [a.id, a])),
      regional: Object.fromEntries(regional.map((e) => [e.id, e])),
    }),
  upsertIncident: (i, ev) =>
    set((s) => {
      const events = ev ? { ...s.events, [i.id]: [...(s.events[i.id] ?? []).filter((x) => x.id !== ev.id), ev] } : s.events;
      return { incidents: { ...s.incidents, [i.id]: i }, events };
    }),
  setEvents: (incidentId, evs) => set((s) => ({ events: { ...s.events, [incidentId]: evs } })),
  upsertAlert: (a) => set((s) => ({ alerts: { ...s.alerts, [a.id]: a } })),
  upsertRun: (r) => set((s) => ({ runs: { ...s.runs, [r.incidentId]: r } })),
  upsertDispatch: (d) => set((s) => ({ dispatches: { ...s.dispatches, [d.incidentId]: d } })),
  upsertRegional: (e) =>
    set((s) => {
      const regional = { ...s.regional };
      if (e.intensity === 0) delete regional[e.id];
      else regional[e.id] = e;
      return { regional };
    }),
  setUplinkDown: (down) => set({ uplinkDown: down }),
  takeBacklog: () => {
    const b = get().backlog;
    set({ backlog: [] });
    return b;
  },
}));

export const openIncidents = (s: IncidentState) => Object.values(s.incidents).filter((i) => i.status !== "RESOLVED");
