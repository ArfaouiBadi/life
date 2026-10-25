import { Wordmark } from "@/components/hg/BrandMark";
import { MarsClock, SimBadge } from "@/components/hg/clock";
import { UserMenu } from "./UserMenu";

/** Simple frame for staff tools outside the control room (technician, admin). */
export function StaffShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col bg-twilight text-glass">
      <header className="flex h-12 shrink-0 items-center gap-5 border-b border-hairline px-5">
        <Wordmark />
        <span className="text-mist">{title}</span>
        <MarsClock />
        <div className="ml-auto flex items-center gap-3">
          <SimBadge />
          <UserMenu />
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
