import { useEffect, useMemo } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { api } from "@/api";
import type { HatchState, Id } from "@/api/contracts";
import { useHome, useHomeLive, useHomeStatus, useIncidentBundle } from "@/hooks/data";
import { useDirectory } from "@/hooks/useDirectory";
import { useIncidentStore } from "@/stores/incidentStore";
import { useUiStore } from "@/stores/uiStore";
import { useSessionStore } from "@/stores/sessionStore";
import { Loading, ErrorLine } from "@/components/hg/Loading";
import { SeverityLabel, StatusGlyph } from "@/components/hg/status";
import { sortIncidents } from "@/features/incidents/IncidentColumn";
import { PlaybookPanel } from "@/features/incidents/PlaybookPanel";
import { FloorPlan } from "./FloorPlan";
import { FitChart, PhysicsPanel, SystemsForecast } from "./PhysicsPanel";
import { RoomReadings, SystemsStrip } from "./Readings";

export default function TwinPage() {
  const { homeCode = "" } = useParams();
  const code = homeCode.toUpperCase();
  const { data: home, error } = useHome(code);
  const { latest, predictions } = useHomeLive(home?.id);
  const status = useHomeStatus(home?.id);
  const { data: dir } = useDirectory();
  const where = dir?.homeByCode.get(code);
  const role = useSessionStore((s) => s.session?.user.role);
  const setFocus = useUiStore((s) => s.setFocusSettlement);
  useEffect(() => {
    if (where) setFocus(where.settlement.code);
  }, [where, setFocus]);

  const incidents = useIncidentStore((s) => s.incidents);
  const runs = useIncidentStore((s) => s.runs);
  const dispatches = useIncidentStore((s) => s.dispatches);
  const open = useMemo(() => Object.values(incidents).filter((i) => i.homeId === home?.id && i.status !== "RESOLVED").sort(sortIncidents), [incidents, home?.id]);
  const lead = open[0];
  const { data: bundle } = useIncidentBundle(lead?.code);
  const run = lead ? (runs[lead.id] ?? bundle?.run) : undefined;
  const dispatch = lead ? (dispatches[lead.id] ?? bundle?.dispatch) : undefined;

  if (error) return <ErrorLine error={error} />;
  if (!home) return <Loading label="Opening the home" />;

  const severity = status?.severity ?? home.severity;
  const link = status?.link ?? home.link;
  const liveHome = { ...home, link };

  const onHatch =
    role === "SUPERVISOR"
      ? (hatchId: Id, state: HatchState) =>
          api.setHatchState(home.id, hatchId, state as "OPEN" | "SEALED").then(
            () => toast(state === "SEALED" ? "Hatch sealed" : "Hatch opened", { description: "Supervisor override" }),
            (e: Error) => toast.error(e.message),
          )
      : undefined;

  return (
    <div className="@container absolute inset-0 overflow-y-auto">
      <div className="grid min-h-full grid-cols-1 @[760px]:grid-cols-[minmax(0,1fr)_340px] @[1100px]:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col px-6 pb-6 pt-5">
          <nav className="text-mist" aria-label="Breadcrumb">
            <Link to="/ops/map" className="hover:text-glass hover:underline underline-offset-4">
              Mars
            </Link>
            {where && (
              <>
                {" / "}
                <Link to={`/ops/map/${where.settlement.code}`} className="hover:text-glass hover:underline underline-offset-4">
                  {where.settlement.name}
                </Link>
                {" / "}
                <Link to={`/ops/map/${where.settlement.code}/${where.dome.code}`} className="hover:text-glass hover:underline underline-offset-4">
                  {where.dome.name} dome
                </Link>
              </>
            )}
          </nav>
          <div className="mt-1 flex flex-wrap items-end gap-x-5 gap-y-1">
            <h1 className="w-expanded text-[36px] font-[650] leading-[1.1]">{home.householdName}</h1>
            <span className="w-condensed tabular pb-1 text-[18px] text-mist">{home.code}</span>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-mist">
            <SeverityLabel severity={severity} link={link} />
            <span>{home.template === "FAMILY" ? "Family home" : "Pod"}, {home.plan.charAt(0) + home.plan.slice(1).toLowerCase()} plan</span>
            <span>{home.occupants.map((o) => o.name.split(" ")[0]).join(", ")}</span>
          </p>

          <div className="relative mt-4 h-[min(52vh,520px)] shrink-0 rounded-instrument border border-hairline bg-twilight p-3">
            {link === "OFFLINE" && (
              <p className="absolute left-4 top-3 z-10 flex items-center gap-2 text-offline">
                <StatusGlyph severity="NOMINAL" link="OFFLINE" size={14} /> Not reporting. Showing the last known state.
              </p>
            )}
            <FloorPlan home={liveHome} live={latest} predictions={predictions} onHatch={onHatch} />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-6 @[1100px]:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <FitChart predictions={predictions} />
            <SystemsForecast predictions={predictions} />
          </div>
          <RoomReadings home={home} live={latest} />
          <SystemsStrip home={home} live={latest} />
        </div>

        <aside className="space-y-6 border-l border-hairline bg-dusk/40 px-5 py-5" aria-label="Danger and response">
          <PhysicsPanel home={liveHome} predictions={predictions} severity={severity} />
          <div className="border-t border-hairline pt-5">
            {lead ? (
              <PlaybookPanel incident={lead} run={run} dispatch={dispatch} home={home} live={latest} />
            ) : (
              <p className="text-mist">No open incidents. Life is watching this home around the clock.</p>
            )}
            {open.length > 1 && (
              <ul className="mt-4 space-y-1 border-t border-hairline pt-3">
                {open.slice(1).map((i) => (
                  <li key={i.id}>
                    <Link to={`/ops/incidents/${i.code}`} className="flex items-center gap-2 hover:underline underline-offset-4">
                      <StatusGlyph severity={i.severity} size={12} /> {i.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
