import { cn } from "@/lib/utils";

/** Dome on the horizon: glass arc over a regolith ground line. */
export function BrandMark({ className, size = 22 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className={cn("shrink-0", className)}>
      <path d="M6 23a10 10 0 0 1 20 0" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <path d="M4 23.5h24" stroke="var(--color-regolith)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M16 13v5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <BrandMark />
      <span className="w-expanded font-[650] tracking-[-0.01em] text-[17px]">Life</span>
    </span>
  );
}
