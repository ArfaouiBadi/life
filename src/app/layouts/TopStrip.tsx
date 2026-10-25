import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Radio, Volume2, VolumeX } from "lucide-react";
import type { RegionalEvent, Severity } from "@/api/contracts";
import { Wordmark } from "@/components/hg/BrandMark";
import { MarsClock, SimBadge } from "@/components/hg/clock";
import { StatusGlyph } from "@/components/hg/status";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFleetStore } from "@/stores/fleetStore";
import { useIncidentStore } from "@/stores/incidentStore";
import { useUiStore } from "@/stores/uiStore";
import { useSettlements } from "@/hooks/data";
import { SEVERITY_PLURAL, ageWords, num } from "@/lib/format";
import { UserMenu } from "./UserMenu";
import { cn } from "@/lib/utils";

const ORDER: Severity[] = ["EMERGENCY", "CRITICAL", "WARNING", "ADVISORY"];

export function regionalTitle(e: RegionalEvent, names: Map<number, string>) {
  const where = e.settlementIds.length > 3 ? "every settlement" : e.settlementIds.map((id) => names.get(id) ?? "").join(" and ");
  if (e.kind === "DUST_STORM") return e.intensity < 2 ? `Light dust over ${where}` : `Dust storm over ${where}`;
  return `Solar storm over ${where}`;
}
export const regionalSeverity = (e: RegionalEvent): Severity =>
  e.homesNeedingAction > 0 ? "CRITICAL" : e.kind === "DUST_STORM" && e.intensity < 2 ? "ADVISORY" : "WARNING";

export function TopStrip() {
  const summary = useFleetStore((s) => s.summary);
  const regional = useIncidentStore((s) => s.regional);
  const uplinkDown = useIncidentStore((s) => s.uplinkDown);
  const { muted, toggleMute, severityFilter, setSeverityFilter, focusSettlement } = useUiStore();
  const { data: settlements } = useSettlements();
  const navigate = useNavigate();
  const names = new Map((settlements ?? []).map((s) => [s.id, s.name]));
  const focus = settlements?.find((s) => s.code === focusSettlement);

  return (
    <header className="@container flex h-12 min-w-0 shrink-0 items-center gap-4 overflow-hidden border-b border-hairline px-4 text-[14px]">
      <Wordmark className="@max-[1080px]:[&>span:last-child]:hidden" />
      <MarsClock focusLon={focus?.lon} focusName={focus?.name} />
      <div className="flex min-w-0 shrink items-center gap-3.5 overflow-hidden" role="group" aria-label="Fleet status">
        {summary &&
          ORDER.filter((s) => summary.bySeverity[s] > 0).map((s) => {
            const n = summary.bySeverity[s];
            const active = severityFilter === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSeverityFilter(active ? null : s)}
                aria-pressed={active}
                className={cn("inline-flex items-center gap-1.5 rounded-control px-1.5 py-0.5 tabular whitespace-nowrap hover:bg-dusk-high", active && "bg-dusk-high")}
              >
                <StatusGlyph severity={s} size={13} />
                <span className="font-[560]">{num(n)}</span>
                <span>{SEVERITY_PLURAL[s][n === 1 ? 0 : 1]}</span>
              </button>
            );
          })}
        {summary && summary.offline > 0 && (
          <span className="inline-flex items-center gap-1.5 tabular whitespace-nowrap">
            <StatusGlyph severity="NOMINAL" link="OFFLINE" size={13} />
            <span className="font-[560]">{num(summary.offline)}</span> offline
          </span>
        )}
        {summary && <span className="tabular whitespace-nowrap text-mist @max-[1060px]:hidden">{num(summary.bySeverity.NOMINAL)} normal</span>}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden @max-[1180px]:invisible">
        {Object.values(regional).map((e) => (
          <button
            key={e.id}
            type="button"
            className="inline-flex min-w-0 items-center gap-1.5 truncate rounded-control px-1.5 py-0.5 hover:bg-dusk-high"
            onClick={() => {
              const s = settlements?.find((x) => x.id === e.settlementIds[0]);
              if (s) navigate(`/ops/map/${s.code}`);
            }}
          >
            <StatusGlyph severity={regionalSeverity(e)} size={13} />
            <span className="truncate">{regionalTitle(e, names)}</span>
          </button>
        ))}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-3">
        <SimBadge />
        <UplinkState down={uplinkDown} />
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" onClick={toggleMute} aria-pressed={muted} aria-label={muted ? "Unmute alarms" : "Mute alarms"} className="grid size-8 place-items-center rounded-control hover:bg-dusk-high">
              {muted ? <VolumeX className="size-4 text-mist" /> : <Volume2 className="size-4" />}
            </button>
          </TooltipTrigger>
          <TooltipContent>{muted ? "Unmute alarms" : "Mute alarms"} (M)</TooltipContent>
        </Tooltip>
        <UserMenu />
      </div>
    </header>
  );
}

function UplinkState({ down }: { down: boolean }) {
  const [since, setSince] = useState<number | null>(null);
  const [, force] = useState(0);
  useEffect(() => {
    setSince(down ? Date.now() : null);
    if (!down) return;
    const id = setInterval(() => force((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [down]);
  if (!down)
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-mist" title="Uplink normal">
        <Radio className="size-4" aria-hidden />
        <span className="@max-[1180px]:sr-only">Uplink normal</span>
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-[560] text-critical" role="status">
      <StatusGlyph severity="CRITICAL" size={13} />
      Uplink lost for <span className="tabular">{ageWords(since ? Date.now() - since : 0)}</span>
    </span>
  );
}
