import { cn } from "@/lib/utils";

/** A plain phone bezel (44 px corners) for showing the resident app beside the console. */
export function PhoneFrame({ children, className, label = "Resident app" }: { children: React.ReactNode; className?: string; label?: string }) {
  return (
    <div
      className={cn("relative mx-auto flex h-full max-h-[812px] w-full max-w-[380px] flex-col overflow-hidden rounded-[44px] border-[9px] border-[#060B14] bg-res-ground shadow-[0_24px_60px_rgba(0,0,0,.45)]", className)}
      role="region"
      aria-label={label}
    >
      <div className="pointer-events-none absolute left-1/2 top-2 z-20 h-5 w-24 -translate-x-1/2 rounded-full bg-[#060B14]" aria-hidden />
      {children}
    </div>
  );
}
