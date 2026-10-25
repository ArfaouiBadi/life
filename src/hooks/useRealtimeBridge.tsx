import { useEffect } from "react";
import { toast } from "sonner";
import { api, realtime } from "@/api";
import { topics } from "@/api/RealtimeClient";
import type { Alert, Dispatch, FleetStatusMessage, FleetSummary, Incident, IncidentEvent, PlaybookRun, RegionalEvent } from "@/api/contracts";
import { useFleetStore } from "@/stores/fleetStore";
import { useIncidentStore } from "@/stores/incidentStore";
import { queryClient } from "@/app/queryClient";
import { useTelemetryStore } from "@/stores/telemetryStore";
import { localClock } from "@/lib/localTime";
import type { Directory } from "./useDirectory";

/** After the simulation is reset (Demo Director), drop everything cached from the old world and reload. */
export async function reseedClientState() {
  useIncidentStore.setState({ incidents: {}, events: {}, alerts: {}, runs: {}, dispatches: {}, regional: {}, backlog: [] });
  useTelemetryStore.setState({ latest: {}, predictions: {}, series: {} });
  await queryClient.invalidateQueries();
  const [incidents, alerts, regional, summary] = await Promise.all([api.listIncidents({}), api.listAlerts({ open: true, size: 500 }), api.listRegionalEvents(), api.getFleetSummary()]);
  useIncidentStore.getState().seed({ incidents, alerts: alerts.content, regional });
  useFleetStore.getState().setSummary(summary);
}

/** Seeds the stores once, then keeps them current from the global topics. Mounted once at the root. */
export function useRealtimeBridge() {
  useEffect(() => {
    let cancelled = false;
    let downSinceMs: number | null = null;
    const fleet = useFleetStore.getState();
    const inc = useIncidentStore.getState();

    void Promise.all([api.listIncidents({}), api.listAlerts({ open: true, size: 500 }), api.listRegionalEvents(), api.getFleetSummary()]).then(
      ([incidents, alerts, regional, summary]) => {
        if (cancelled) return;
        inc.seed({ incidents, alerts: alerts.content, regional });
        fleet.setSummary(summary);
      },
    );

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
      realtime.onStatusChange((s) => {
        if (s === "CLOSED") {
          downSinceMs = useFleetStore.getState().simTimeMs;
          inc.setUplinkDown(true);
        }
        if (s === "OPEN" && downSinceMs !== null) {
          const since = downSinceMs;
          downSinceMs = null;
          inc.setUplinkDown(false);
          // The backlog is replayed right after OPEN; summarise what the homes did on their own.
          setTimeout(() => {
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
          }, 50);
        }
      }),
    ];
    void realtime.connect();
    return () => {
      cancelled = true;
      offs.forEach((off) => off());
    };
  }, []);
}
