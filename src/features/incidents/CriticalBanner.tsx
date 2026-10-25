import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { api } from "@/api";
import { StatusGlyph } from "@/components/hg/status";
import { TtdCountdown } from "@/components/hg/TtdCountdown";
import { Button } from "@/components/ui/button";
import { useIncidentStore } from "@/stores/incidentStore";
import { useDirectory } from "@/hooks/useDirectory";
import { sortIncidents } from "./IncidentColumn";

/** The one unacknowledged critical or emergency that matters most, across the top of the map. */
export function CriticalBanner() {
  const incidents = useIncidentStore((s) => s.incidents);
  const { data: dir } = useDirectory();
  const navigate = useNavigate();
  const loc = useLocation();
  const top = useMemo(
    () =>
      Object.values(incidents)
        .filter((i) => i.status !== "RESOLVED" && !i.acknowledgedAt && (i.severity === "CRITICAL" || i.severity === "EMERGENCY"))
        .sort(sortIncidents)[0],
    [incidents],
  );
  if (!top) return null;
  const home = top.homeId !== null ? dir?.homeById.get(top.homeId) : undefined;
  // The twin of that home already carries the same controls.
  if (home && loc.pathname === `/ops/homes/${home.code}`) return null;
  const emergency = top.severity === "EMERGENCY";

  return (
    <div
      role="alert"
      className="relative flex shrink-0 items-center gap-3 border-b bg-dusk py-2 pl-5 pr-3"
      style={{ borderColor: emergency ? "var(--color-emergency)" : "var(--color-critical)" }}
    >
      <span
        className="absolute inset-y-0 left-0 w-2"
        style={{ background: emergency ? "repeating-linear-gradient(45deg,#FF2E63 0 3px,#0F1B2D 3px 6px)" : "var(--color-critical)" }}
        aria-hidden
      />
      <StatusGlyph severity={top.severity} size={18} />
      <div className="min-w-0 flex-1">
        <span className="font-[650]">{top.title}</span>
        {home && (
          <span className="ml-2 text-mist">
            <span className="w-condensed tabular">{home.code}</span>, {home.householdName}
          </span>
        )}
      </div>
      {top.ttdSeconds !== null && <TtdCountdown seconds={top.ttdSeconds} severity={top.severity} size="sm" />}
      {home && (
        <Button variant="outline" size="sm" onClick={() => navigate(`/ops/homes/${home.code}`)}>
          Open home
        </Button>
      )}
      <Button
        size="sm"
        onClick={() =>
          api.acknowledgeIncident(top.id).then(
            () => toast("Acknowledged", { description: top.title }),
            (e: Error) => toast.error(e.message),
          )
        }
      >
        Acknowledge
      </Button>
    </div>
  );
}
