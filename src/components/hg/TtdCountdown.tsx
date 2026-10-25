import { useEffect, useRef, useState } from "react";
import type { Severity } from "@/api/contracts";
import { formatTtd, ttdWords } from "@/lib/format";
import { useFleetStore } from "@/stores/fleetStore";
import { SEV_COLOR } from "./status";
import { cn } from "@/lib/utils";

/**
 * Time-to-danger numerals. The server value arrives once per tick; between ticks we count down
 * locally at the sim speed so the seconds move smoothly. Expanded width, tabular figures.
 */
export function TtdCountdown({
  seconds,
  severity,
  label = "Unsafe air in",
  stableText = "Stable",
  stableLabel = "Air supply",
  size = "lg",
  className,
}: {
  seconds: number | null | undefined;
  severity: Severity;
  label?: string;
  stableText?: string;
  stableLabel?: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const speed = useFleetStore((s) => s.speed);
  const [shown, setShown] = useState(seconds ?? null);
  const base = useRef({ v: seconds ?? null, at: performance.now() });

  useEffect(() => {
    base.current = { v: seconds ?? null, at: performance.now() };
    setShown(seconds ?? null);
    if (seconds == null) return;
    const id = setInterval(() => {
      const { v, at } = base.current;
      if (v != null) setShown(Math.max(0, v - ((performance.now() - at) / 1000) * speed));
    }, 250);
    return () => clearInterval(id);
  }, [seconds, speed]);

  const sizes = { sm: "text-[16px]", md: "text-[24px]", lg: "text-[48px]", xl: "text-[72px]" };
  const color = severity === "NOMINAL" ? "var(--color-glass)" : SEV_COLOR[severity];

  if (shown == null)
    return (
      <div className={cn("leading-[1.1]", className)}>
        {size !== "sm" && <div className="text-mist text-sm">{stableLabel}</div>}
        <div className={cn("w-expanded font-[600] tabular", sizes[size])}>{stableText}</div>
      </div>
    );
  return (
    <div className={cn("leading-[1.1]", className)} role="timer" aria-label={`${label} ${ttdWords(shown)}`}>
      {size !== "sm" && <div className="text-mist text-sm">{label}</div>}
      <div className={cn("w-expanded font-[600] tabular", sizes[size])} style={{ color }}>
        {size === "sm" && <span className="sr-only">{label} </span>}
        {shown > 172800 ? `${Math.floor(shown / 88775)} sols` : formatTtd(shown)}
      </div>
    </div>
  );
}
