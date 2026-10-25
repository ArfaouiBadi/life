import { memo } from "react";
import type { HomeSummary, Severity } from "@/api/contracts";
import { hexCorners } from "@/lib/hex";
import { polyPoints } from "@/lib/geometry";
import { useHomeStatus } from "@/hooks/data";
import { SEV_COLOR } from "@/components/hg/status";
import { SEVERITY_WORD, ttdWords } from "@/lib/format";
import { MOSAIC } from "../mosaic";

const FILL_ALPHA: Partial<Record<Severity, number>> = { WARNING: 0.25, CRITICAL: 0.35 };

function glyphPath(sev: Severity, s: number) {
  if (sev === "WARNING") return `M0,${-s} L${s * 0.95},${s * 0.75} L${-s * 0.95},${s * 0.75}Z`;
  if (sev === "CRITICAL") return `M0,${-s} L${s},0 L0,${s} L${-s},0Z`;
  if (sev === "EMERGENCY") {
    const a = s * 0.41;
    return `M${-a},${-s} L${a},${-s} L${s},${-a} L${s},${a} L${a},${s} L${-a},${s} L${-s},${a} L${-s},${-a}Z`;
  }
  return "";
}

/** One home on the dome's hex grid. Shape + fill + glyph carry status; the room mosaic shows where. */
export const HomeTile = memo(function HomeTile({
  home,
  cx,
  cy,
  size,
  detail,
  onOpen,
  onKey,
  registerRef,
}: {
  home: HomeSummary;
  cx: number;
  cy: number;
  size: number;
  detail: "far" | "near";
  onOpen: (h: HomeSummary) => void;
  onKey: (h: HomeSummary, e: React.KeyboardEvent) => void;
  registerRef: (code: string, el: SVGGElement | null) => void;
}) {
  const live = useHomeStatus(home.id);
  const sev = live?.severity ?? home.severity;
  const link = live?.link ?? home.link;
  const ttd = live?.ttdSeconds ?? home.ttdSeconds;
  const rooms = live?.roomSeverities ?? home.roomSeverities;
  const offline = link === "OFFLINE";
  const color = SEV_COLOR[sev];
  const corners = polyPoints(hexCorners(0, 0, size * 0.92));
  const loud = !offline && (sev === "CRITICAL" || sev === "EMERGENCY");

  const label = `Home ${home.code}, ${home.householdName}, ${offline ? "not reporting" : SEVERITY_WORD[sev].toLowerCase()}${
    ttd !== null ? `, unsafe air in ${ttdWords(ttd)}` : ""
  }`;

  const m = MOSAIC[home.template];
  const mw = size * 1.15;
  const scale = mw / m.w;
  const mh = m.h * scale;

  return (
    <g
      ref={(el) => registerRef(home.code, el)}
      transform={`translate(${cx},${cy})`}
      role="button"
      tabIndex={-1}
      aria-label={label}
      data-home={home.code}
      className="cursor-pointer outline-none [&:focus-visible>.focus]:opacity-100"
      onClick={(e) => {
        e.stopPropagation();
        onOpen(home);
      }}
      onKeyDown={(e) => onKey(home, e)}
    >
      {loud && <polygon points={polyPoints(hexCorners(0, 0, size * 1.25))} fill={color} className="alarm-pulse" style={{ opacity: 0.3 }} />}
      <polygon
        points={corners}
        fill={offline ? "none" : sev === "EMERGENCY" ? "url(#hazard)" : FILL_ALPHA[sev] ? color : "#0F1B2D"}
        fillOpacity={offline ? 0 : sev === "EMERGENCY" ? 0.85 : (FILL_ALPHA[sev] ?? 0.55)}
        stroke={offline ? "var(--color-offline)" : sev === "NOMINAL" ? "var(--color-glass)" : color}
        strokeOpacity={sev === "NOMINAL" && !offline ? 0.28 : 1}
        strokeWidth={sev === "NOMINAL" || sev === "ADVISORY" ? size * 0.05 : size * 0.08}
        strokeDasharray={offline ? `${size * 0.22} ${size * 0.16}` : undefined}
        vectorEffect="non-scaling-stroke"
      />
      {detail === "near" && (
        <g transform={`translate(${-mw / 2},${-mh / 2 - size * 0.08})`} aria-hidden>
          {rooms.map((r) => {
            const rect = m.rooms[r.roomCode];
            if (!rect) return null;
            const quiet = r.severity === "NOMINAL";
            return (
              <rect
                key={r.roomCode}
                x={rect[0] * scale}
                y={rect[1] * scale}
                width={rect[2] * scale}
                height={rect[3] * scale}
                fill={quiet ? "transparent" : SEV_COLOR[r.severity]}
                fillOpacity={quiet ? 0 : 0.85}
                stroke="var(--color-glass)"
                strokeOpacity={0.35}
                strokeWidth={size * 0.02}
              />
            );
          })}
        </g>
      )}
      {!offline && sev !== "NOMINAL" && sev !== "ADVISORY" && (
        <path
          d={glyphPath(sev, detail === "near" ? size * 0.28 : size * 0.42)}
          transform={detail === "near" ? `translate(${size * 0.52},${-size * 0.48})` : undefined}
          fill={color}
          stroke="#0F1B2D"
          strokeWidth={size * 0.06}
        />
      )}
      {detail === "near" && (
        <text y={size * 0.62} textAnchor="middle" className="w-condensed tabular" fontSize={size * 0.2} fill="var(--color-mist)">
          {home.code.slice(-3)}
        </text>
      )}
      <polygon className="focus opacity-0" points={polyPoints(hexCorners(0, 0, size * 1.08))} fill="none" stroke="var(--color-glass)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </g>
  );
});
