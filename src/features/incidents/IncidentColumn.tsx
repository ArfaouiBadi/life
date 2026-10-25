import { useMemo } from "react";
import { Link, useNavigate } from "react-router";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import type { Incident, RegionalEvent } from "@/api/contracts";
import { sevRank } from "@/api/contracts";
import { StatusGlyph } from "@/components/hg/status";
import { TtdCountdown } from "@/components/hg/TtdCountdown";
import { useIncidentStore } from "@/stores/incidentStore";
import { useUiStore } from "@/stores/uiStore";
import { useDirectory } from "@/hooks/useDirectory";
import { useSettlements } from "@/hooks/data";
import { SEVERITY_PLURAL, STATUS_WORD, plural } from "@/lib/format";
import { regionalSeverity, regionalTitle } from "@/app/layouts/TopStrip";
import { cn } from "@/lib/utils";

export const sortIncidents = (a: Incident, b: Incident) =>
  sevRank(b.severity) - sevRank(a.severity) || (a.ttdSeconds ?? Infinity) - (b.ttdSeconds ?? Infinity) || b.id - a.id;

export function IncidentColumn() {
  const { incidentColumnOpen: open, setIncidentColumn, severityFilter, setSeverityFilter, focusedIncidentId } = useUiStore();
  const incidents = useIncidentStore((s) => s.incidents);
  const regional = useIncidentStore((s) => s.regional);
  const list = useMemo(
    () =>
      Object.values(incidents)
        .filter((i) => i.status !== "RESOLVED" && (!severityFilter || i.severity === severityFilter))
        .sort(sortIncidents),
    [incidents, severityFilter],
  );

  if (!open)
    return (
      <aside className="flex flex-col items-center border-l border-hairline bg-dusk py-2" aria-label="Incidents (collapsed)">
        <button type="button" onClick={() => setIncidentColumn(true)} aria-label="Show incidents" className="grid size-8 place-items-center rounded-control hover:bg-dusk-high">
          <PanelRightOpen className="size-4" />
        </button>
        <span className="mt-2 tabular font-[650]">{list.length}</span>
      </aside>
    );

  return (
    <aside className="flex min-h-0 flex-col border-l border-hairline bg-dusk" aria-label="Incidents">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-hairline pl-4 pr-2">
        <h2 className="text-[16px] font-[650]">
          <Link to="/ops/incidents" className="hover:underline underline-offset-4">
            Incidents
          </Link>
        </h2>
        <span className="tabular text-mist">{list.length}</span>
        <button type="button" onClick={() => setIncidentColumn(false)} aria-label="Hide incidents" className="ml-auto grid size-8 place-items-center rounded-control text-mist hover:bg-dusk-high hover:text-glass">
          <PanelRightClose className="size-4" />
        </button>
      </div>
      {severityFilter && (
        <div className="flex items-center gap-2 border-b border-hairline px-4 py-2 text-mist">
          <StatusGlyph severity={severityFilter} size={12} />
          Showing {SEVERITY_PLURAL[severityFilter][1]} only.
          <button type="button" className="ml-auto text-glass underline underline-offset-4" onClick={() => setSeverityFilter(null)}>
            Show all
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!severityFilter && Object.values(regional).map((e) => <RegionalRow key={e.id} e={e} />)}
        <ul>
          {list.map((i) => (
            <IncidentRow key={i.id} incident={i} focused={focusedIncidentId === i.id} />
          ))}
        </ul>
        {list.length === 0 && (
          <p className="px-4 py-6 text-mist">{severityFilter ? "Nothing at this level right now." : "No open incidents. Every home is reporting normally."}</p>
        )}
      </div>
    </aside>
  );
}

function RegionalRow({ e }: { e: RegionalEvent }) {
  const { data: settlements } = useSettlements();
  const names = new Map((settlements ?? []).map((s) => [s.id, s.name]));
  const navigate = useNavigate();
  const solar = e.kind === "DUST_STORM";
  return (
    <button
      type="button"
      onClick={() => {
        const s = settlements?.find((x) => x.id === e.settlementIds[0]);
        if (s) navigate(`/ops/map/${s.code}`);
      }}
      className="flex w-full items-start gap-2.5 border-b border-hairline px-4 py-3 text-left hover:bg-dusk-high"
    >
      <StatusGlyph severity={regionalSeverity(e)} size={14} className="mt-0.5" />
      <span className="min-w-0">
        <span className="block font-[560]">{regionalTitle(e, names)}</span>
        <span className="block text-mist">
          {plural(e.affectedHomes, "home", "homes")} {solar ? "on reduced solar" : "under raised radiation"}
          {e.homesNeedingAction > 0 ? `, ${e.homesNeedingAction} need action` : ""}
        </span>
      </span>
    </button>
  );
}

function IncidentRow({ incident: i, focused }: { incident: Incident; focused: boolean }) {
  const { data: dir } = useDirectory();
  const home = i.homeId !== null ? dir?.homeById.get(i.homeId) : undefined;
  const navigate = useNavigate();
  const focusIncident = useUiStore((s) => s.focusIncident);
  const loud = i.severity === "CRITICAL" || i.severity === "EMERGENCY";
  return (
    <li className={cn("border-b border-hairline", focused && "bg-dusk-high")}>
      <button
        type="button"
        onClick={() => {
          focusIncident(i.id);
          navigate(home ? `/ops/homes/${home.code}` : `/ops/incidents/${i.code}`);
        }}
        onFocus={() => focusIncident(i.id)}
        className="relative flex w-full items-start gap-2.5 px-4 py-3 text-left hover:bg-dusk-high"
      >
        {i.severity === "EMERGENCY" && <span className="absolute inset-y-0 left-0 w-1" style={{ background: "repeating-linear-gradient(45deg,#FF2E63 0 3px,#0F1B2D 3px 6px)" }} aria-hidden />}
        <StatusGlyph severity={i.severity} size={14} className="mt-0.5" title={i.severity.toLowerCase()} />
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate font-[560]", loud && "text-glass")}>{i.title}</span>
          <span className="flex items-baseline gap-2 text-mist">
            <span className="w-condensed tabular">{home?.code ?? "Regional"}</span>
            <span className="truncate">{home?.householdName}</span>
          </span>
        </span>
        <span className="text-right">
          {i.ttdSeconds !== null ? (
            <TtdCountdown seconds={i.ttdSeconds} severity={i.severity} size="sm" />
          ) : (
            <span className="text-mist">{STATUS_WORD[i.status]}</span>
          )}
        </span>
      </button>
    </li>
  );
}
