import { useEffect } from "react";
import { toast } from "sonner";
import { api, isMock, realtime } from "@/api";
import { topics } from "@/api/RealtimeClient";
import type { Alert, Dispatch, FleetStatusMessage, FleetSummary, Incident, IncidentEvent, PlaybookRun, RegionalEvent } from "@/api/contracts";
import { useFleetStore } from "@/stores/fleetStore";
import { useIncidentStore } from "@/stores/incidentStore";
import { useSessionStore } from "@/stores/sessionStore";
import { queryClient } from "@/app/queryClient";
import { useTelemetryStore } from "@/stores/telemetryStore";
import { localClock } from "@/lib/localTime";
import type { Directory } from "./useDirectory";

/** The lists the topics only update: incidents, open alerts, regional events and the fleet summary. */
async function loadLists() {
  const [incidents, alerts, regional, summary] = await Promise.all([api.listIncidents({}), api.listAlerts({ open: true, size: 500 }), api.listRegionalEvents(), api.getFleetSummary()]);
  useIncidentStore.getState().seed({ incidents, alerts: alerts.content, regional });
  useFleetStore.getState().setSummary(summary);
  return incidents;
}

/** Backend only: the lists, then each open incident's playbook, crew and history. A real broker replays nothing it sent while we were away. */
async function catchUp() {
  const incidents = await loadLists();
  const bundles = await Promise.all(incidents.filter((i) => i.status !== "RESOLVED").map((i) => api.getIncidentByCode(i.code)));
  const inc = useIncidentStore.getState();
  for (const b of bundles) {
    inc.setEvents(b.incident.id, b.events);
    if (b.run) inc.upsertRun(b.run);
    if (b.dispatch) inc.upsertDispatch(b.dispatch);
  }
}

/** After the simulation is reset (Demo Director), drop everything cached from the old world and reload. */
export async function reseedClientState() {
  useIncidentStore.setState({ incidents: {}, events: {}, alerts: {}, runs: {}, dispatches: {}, regional: {}, backlog: [] });
  useTelemetryStore.setState({ latest: {}, predictions: {}, series: {} });
  await queryClient.invalidateQueries();
  await loadLists();
}

/** Says what the homes did on their own while the uplink was down. */
function summarizeOutage(since: number) {
  const evs = Object.values(useIncidentStore.getState().events)
    .flat()
    .filter((e) => Date.parse(e.ts) >= since && (e.actor === "Autopilot" || e.kind === "DETECTED"));
  if (!evs.length) return;
  // Times in the home's own local time: "Hatch sealed at 03:14, automatically."
  const dir = queryClient.getQueryData<Directory>(["directory"]);
  const incs = useIncidentStore.getState().incidents;
  const lonOf = (incidentId: number) => {
    const homeId = incs[incidentId]?.homeId;
    return homeId != null ? dir?.homeById.get(homeId)?.settlement.lon : undefined;
  };
  toast("While the uplink was down", {
    description: (
      <ul className="mt-1 space-y-0.5">
        {evs.slice(-5).map((e) => {
          const lon = lonOf(e.incidentId);
          return (
            <li key={e.id}>
              {e.text.replace(/\.$/, "")}
              {lon !== undefined ? ` at ${localClock(e.ts, lon)}` : ""}
              {e.actor === "Autopilot" ? ", automatically" : ""}.
            </li>
          );
        })}
      </ul>
    ),
    duration: 15000,
  });
}

/** Seeds the stores, then keeps them current from the global topics. Mounted once at the root. */
export function useRealtimeBridge() {
  useEffect(() => {
    let down = false;
    let downSinceMs: number | null = null;
    const fleet = useFleetStore.getState();
    const inc = useIncidentStore.getState();
    // Against the backend this runs again after sign-in and after every reconnect.
    const refresh = () =>
      (isMock ? loadLists() : catchUp()).catch((e: Error) => {
        // Before sign-in the backend may refuse; signing in tries again.
        if (useSessionStore.getState().session) toast.error(`Couldn't reload the latest incidents. ${e.message}`);
      });
    void refresh();

    const offs = [
      realtime.subscribe<{ simTime: string; speed: number }>(topics.clock, (m) => fleet.setClock(m.simTime, m.speed)),
      realtime.subscribe<FleetStatusMessage>(topics.fleetStatus, (m) => fleet.applyStatus(m)),
      realtime.subscribe<FleetSummary>(topics.fleetSummary, (m) => fleet.setSummary(m)),
      realtime.subscribe<{ type: string; alert: Alert }>(topics.alerts, (m) => inc.upsertAlert(m.alert)),
      realtime.subscribe<{ incident: Incident; event?: IncidentEvent }>(topics.incidents, (m) => {
        inc.upsertIncident(m.incident, m.event);
        void queryClient.invalidateQueries({ queryKey: ["incident", m.incident.code] });
      }),
      realtime.subscribe<PlaybookRun>(topics.playbookRuns, (m) => inc.upsertRun(m)),
      realtime.subscribe<Dispatch>(topics.dispatches, (m) => inc.upsertDispatch(m)),
      realtime.subscribe<RegionalEvent>(topics.regionalEvents, (m) => inc.upsertRegional(m)),
      useSessionStore.subscribe((s, prev) => {
        if (!isMock && s.session && s.session.token !== prev.session?.token) void refresh();
      }),
      realtime.onStatusChange((s) => {
        if (s === "CLOSED" && !down) {
          down = true;
          downSinceMs = useFleetStore.getState().simTimeMs; // null if the socket failed before the first clock message
          inc.setUplinkDown(true);
        }
        if (s === "OPEN" && down) {
          down = false;
          inc.setUplinkDown(false);
          const since = downSinceMs;
          const summarize = () => {
            if (since !== null) summarizeOutage(since);
          };
          // The mock replays its backlog right after OPEN; a real broker replays nothing, so reload first.
          if (isMock) setTimeout(summarize, 50);
          else void refresh().then(summarize);
        }
      }),
    ];
    void realtime.connect();
    return () => offs.forEach((off) => off());
  }, []);
}
