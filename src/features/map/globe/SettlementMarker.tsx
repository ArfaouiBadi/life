import { forwardRef } from "react";
import type { Settlement } from "@/api/contracts";
import { SEVERITY_WORD, plural } from "@/lib/format";
import { SEV_COLOR, StatusGlyph } from "@/components/hg/status";

/** A settlement on the globe: human place in expanded sans, its natural feature in italic serif. */
export const SettlementMarker = forwardRef<HTMLButtonElement, { settlement: Settlement; onSelect: () => void }>(function SettlementMarker(
  { settlement: s, onSelect },
  ref,
) {
  const loud = s.worstSeverity === "CRITICAL" || s.worstSeverity === "EMERGENCY";
  const ring = s.worstSeverity === "NOMINAL" || s.worstSeverity === "ADVISORY" ? "var(--color-glass)" : SEV_COLOR[s.worstSeverity];
  const label = `${s.name}, ${s.featureName}. ${plural(s.homeCount, "home", "homes")}, ${plural(s.population, "resident", "residents")}. ${
    s.worstSeverity === "NOMINAL" ? "All normal" : `Worst status ${SEVERITY_WORD[s.worstSeverity].toLowerCase()}`
  }${s.openIncidents ? `, ${plural(s.openIncidents, "open incident", "open incidents")}` : ""}.`;
  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      aria-label={label}
      className="group absolute left-0 top-0 -ml-[7px] -mt-[7px] flex items-start gap-2 rounded-instrument text-left opacity-0 outline-offset-4"
      style={{ transition: "opacity 120ms" }}
    >
      <span className="relative mt-[1px] block size-[14px] shrink-0">
        {loud && <span className="alarm-pulse absolute -inset-2 rounded-full" style={{ background: ring, opacity: 0.35 }} />}
        <span className="absolute inset-0 rounded-full border-2 bg-twilight" style={{ borderColor: ring }} />
        <span className="absolute inset-[4px] rounded-full" style={{ background: ring }} />
      </span>
      <span className="pointer-events-none flex flex-col leading-[1.1] [text-shadow:0_1px_6px_#0F1B2D]">
        <span className="flex items-center gap-1.5">
          <span className="w-expanded text-[15px] font-[650] text-glass group-hover:underline group-focus-visible:underline underline-offset-4">{s.name}</span>
          <StatusGlyph severity={s.worstSeverity} size={13} />
        </span>
        <span className="serif-feature text-[13px] text-mist">{s.featureName}</span>
      </span>
    </button>
  );
});
