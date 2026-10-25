import type { LinkState, Severity } from "@/api/contracts";
import { SEVERITY_WORD } from "@/lib/format";
import { cn } from "@/lib/utils";

export const SEV_COLOR: Record<Severity, string> = {
  NOMINAL: "var(--color-glass)",
  ADVISORY: "var(--color-advisory)",
  WARNING: "var(--color-warning)",
  CRITICAL: "var(--color-critical)",
  EMERGENCY: "var(--color-emergency)",
};
export const OFFLINE_COLOR = "var(--color-offline)";

const MARK = "#0F1B2D";

/** Custom status glyphs: shape carries the meaning, so status is never color alone. */
export function StatusGlyph({
  severity,
  link,
  size = 14,
  className,
  title,
}: {
  severity: Severity;
  link?: LinkState;
  size?: number;
  className?: string;
  title?: string;
}) {
  const offline = link === "OFFLINE";
  if (!offline && severity === "NOMINAL") return null;
  const c = offline ? OFFLINE_COLOR : SEV_COLOR[severity];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={cn("inline-block shrink-0", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {offline ? (
        <>
          <circle cx="8" cy="8" r="6.2" fill="none" stroke={c} strokeWidth="1.6" strokeDasharray="2.4 1.8" />
          <path d="M4 12 12 4" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
        </>
      ) : severity === "ADVISORY" ? (
        <>
          <circle cx="8" cy="8" r="7" fill={c} />
          <rect x="7.1" y="7" width="1.8" height="5" rx="0.6" fill={MARK} />
          <circle cx="8" cy="4.6" r="1.05" fill={MARK} />
        </>
      ) : (
        <>
          {severity === "WARNING" && <path d="M8 1.2 15.2 14.3H.8Z" fill={c} strokeLinejoin="round" />}
          {severity === "CRITICAL" && <path d="M8 .6 15.4 8 8 15.4.6 8Z" fill={c} />}
          {severity === "EMERGENCY" && <path d="M5.1.8h5.8l4.1 4.1v5.8l-4.1 4.1H5.1L1 10.7V4.9Z" fill={c} />}
          <rect x="7.1" y={severity === "WARNING" ? 5.4 : 4} width="1.8" height="5" rx="0.6" fill={MARK} />
          <circle cx="8" cy={severity === "WARNING" ? 12.2 : 11.6} r="1.05" fill={MARK} />
        </>
      )}
    </svg>
  );
}

/** Glyph + word, always together in lists. */
export function SeverityLabel({ severity, link, className, short }: { severity: Severity; link?: LinkState; className?: string; short?: boolean }) {
  const offline = link === "OFFLINE";
  const word = offline ? "Not reporting" : SEVERITY_WORD[severity];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", className)}>
      <StatusGlyph severity={severity} link={link} size={13} />
      {!short && (
        <span style={{ color: offline ? OFFLINE_COLOR : severity === "NOMINAL" ? "var(--color-mist)" : SEV_COLOR[severity] }} className="font-[560]">
          {word}
        </span>
      )}
    </span>
  );
}

/** SVG <defs> for hazard stripes (45°, 6 px period), borrowed from industrial safety signage. */
export function HazardDefs({ id = "hazard", opacity = 1 }: { id?: string; opacity?: number }) {
  return (
    <defs>
      <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" fill="#0F1B2D" opacity={opacity} />
        <rect width="3" height="6" fill="#FF2E63" opacity={opacity} />
      </pattern>
    </defs>
  );
}
