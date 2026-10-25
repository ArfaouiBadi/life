import { cn } from "@/lib/utils";

/** Quiet loading line; the mock adds real latency so this state is designed, not discovered. */
export function Loading({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex h-full min-h-32 items-center justify-center text-mist", className)} role="status">
      <span className="inline-flex items-center gap-2">
        <span className="size-1.5 animate-pulse rounded-full bg-mist" aria-hidden />
        {label}
      </span>
    </div>
  );
}

export function ErrorLine({ error, className }: { error: unknown; className?: string }) {
  return (
    <div className={cn("p-6 text-critical", className)} role="alert">
      {error instanceof Error ? error.message : "Something went wrong loading this. Try again."}
    </div>
  );
}
