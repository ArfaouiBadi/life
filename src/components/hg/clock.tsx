import { formatMarsHours, formatSol, lmstAt, marsTime } from "@/lib/marsTime";
import { useFleetStore } from "@/stores/fleetStore";
import { isMock } from "@/api";
import { cn } from "@/lib/utils";

/** Sol and MTC as separate elements; adds the focused settlement's local time. */
export function MarsClock({ focusLon, focusName }: { focusLon?: number; focusName?: string }) {
  const now = useFleetStore((s) => s.simTimeMs);
  if (now === null) return <span className="text-mist">Connecting to the clock</span>;
  const m = marsTime(new Date(now));
  return (
    <div className="flex items-baseline gap-3 tabular whitespace-nowrap">
      <span className="font-[560]">{formatSol(m.sol)}</span>
      <span>
        {formatMarsHours(m.mtcHours)} <span className="text-mist">MTC</span>
      </span>
      {focusLon !== undefined && (
        <span title={focusName ? `Local mean solar time at ${focusName}` : undefined}>
          <span className="text-mist">Local time</span> {formatMarsHours(lmstAt(now, focusLon))}
        </span>
      )}
    </div>
  );
}

/** Always visible in mock mode: we never claim real sensors. */
export function SimBadge({ className }: { className?: string }) {
  const speed = useFleetStore((s) => s.speed);
  if (!isMock) return null;
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-control border border-hairline px-2 py-0.5 text-xs text-mist whitespace-nowrap", className)}
      title="This demo runs on a simulation. No real sensors are connected."
    >
      <span className="size-1.5 rounded-full bg-mist" aria-hidden />
      Simulated<span className="@max-[1000px]:hidden"> telemetry</span>{speed !== 1 && <span className="tabular text-glass">×{speed}</span>}
    </span>
  );
}
