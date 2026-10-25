import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useIncidentStore } from "@/stores/incidentStore";
import { useFleetStore } from "@/stores/fleetStore";
import { useDirectory } from "@/hooks/useDirectory";
import { SeverityLabel } from "@/components/hg/status";
import { TtdCountdown } from "@/components/hg/TtdCountdown";
import { STATUS_WORD } from "@/lib/format";
import { sinceWords } from "@/lib/localTime";
import { sortIncidents } from "./IncidentColumn";
import { cn } from "@/lib/utils";

export default function IncidentListPage() {
  const incidents = useIncidentStore((s) => s.incidents);
  const now = useFleetStore((s) => s.simTimeMs);
  const { data: dir } = useDirectory();
  const [view, setView] = useState<"open" | "all">("open");
  const list = useMemo(() => {
    const all = Object.values(incidents);
    return view === "open" ? all.filter((i) => i.status !== "RESOLVED").sort(sortIncidents) : all.sort((a, b) => b.id - a.id);
  }, [incidents, view]);

  return (
    <div className="absolute inset-0 overflow-y-auto px-6 py-5">
      <div className="flex items-end gap-6">
        <h1 className="w-expanded text-[36px] font-[650] leading-[1.1]">Incidents</h1>
        <div role="tablist" aria-label="Which incidents" className="mb-1 flex gap-1 rounded-control border border-hairline p-0.5">
          {(["open", "all"] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn("rounded-[4px] px-3 py-1", view === v ? "bg-dusk-high text-glass" : "text-mist hover:text-glass")}
            >
              {v === "open" ? "Open" : "All, newest first"}
            </button>
          ))}
        </div>
      </div>
      <table className="mt-5 w-full">
        <thead className="text-left text-mist">
          <tr className="border-b border-hairline">
            <th className="py-2 pr-4 font-normal">Status</th>
            <th className="py-2 pr-4 font-normal">What happened</th>
            <th className="py-2 pr-4 font-normal">Home</th>
            <th className="py-2 pr-4 font-normal">Stage</th>
            <th className="py-2 pr-4 font-normal">Started</th>
            <th className="py-2 pr-4 font-normal">Who</th>
            <th className="py-2 text-right font-normal">Time left</th>
          </tr>
        </thead>
        <tbody>
          {list.map((i) => {
            const home = i.homeId !== null ? dir?.homeById.get(i.homeId) : undefined;
            return (
              <tr key={i.id} className={cn("border-b border-hairline hover:bg-dusk", i.status === "RESOLVED" && "text-mist")}>
                <td className="py-2.5 pr-4">
                  <SeverityLabel severity={i.severity} />
                </td>
                <td className="py-2.5 pr-4">
                  <Link to={`/ops/incidents/${i.code}`} className="font-[560] hover:underline underline-offset-4">
                    {i.title}
                  </Link>
                  <span className="w-condensed ml-2 tabular text-mist">{i.code}</span>
                </td>
                <td className="py-2.5 pr-4">
                  {home ? (
                    <Link to={`/ops/homes/${home.code}`} className="hover:underline underline-offset-4">
                      <span className="w-condensed tabular">{home.code}</span> <span className="text-mist">{home.householdName}</span>
                    </Link>
                  ) : (
                    <span className="text-mist">Regional</span>
                  )}
                </td>
                <td className="py-2.5 pr-4">{STATUS_WORD[i.status]}</td>
                <td className="py-2.5 pr-4 text-mist">{sinceWords(i.startedAt, now)}</td>
                <td className="py-2.5 pr-4 text-mist">{i.assignee ?? "Nobody yet"}</td>
                <td className="py-2.5 text-right">{i.ttdSeconds !== null ? <TtdCountdown seconds={i.ttdSeconds} severity={i.severity} size="sm" /> : <span className="text-mist">None</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {list.length === 0 && <p className="mt-6 text-mist">No open incidents. Every home is reporting normally.</p>}
    </div>
  );
}
