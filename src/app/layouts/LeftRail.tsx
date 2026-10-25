import { NavLink } from "react-router";
import { Activity, Clapperboard, Keyboard, Map as MapIcon, Siren, type LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSessionStore } from "@/stores/sessionStore";
import { useUiStore } from "@/stores/uiStore";
import { isMock } from "@/api";
import { cn } from "@/lib/utils";

function RailLink({ to, label, icon: Icon }: { to: string; label: string; icon: LucideIcon }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <NavLink
          to={to}
          aria-label={label}
          className={({ isActive }) =>
            cn("relative grid size-10 place-items-center rounded-control text-mist hover:bg-dusk-high hover:text-glass", isActive && "bg-dusk-high text-glass")
          }
        >
          {({ isActive }) => (
            <>
              {isActive && <span className="absolute -left-2 top-2 bottom-2 w-0.5 rounded-full bg-glass" aria-hidden />}
              <Icon className="size-[18px]" />
            </>
          )}
        </NavLink>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function RailButton({ label, icon: Icon, onClick, hint }: { label: string; icon: LucideIcon; onClick: () => void; hint?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label={label} onClick={onClick} className="grid size-10 place-items-center rounded-control text-mist hover:bg-dusk-high hover:text-glass">
          <Icon className="size-[18px]" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">
        {label}
        {hint && <span className="ml-1.5 text-mist">{hint}</span>}
      </TooltipContent>
    </Tooltip>
  );
}

export function LeftRail() {
  const role = useSessionStore((s) => s.session?.user.role);
  const { setDirector, setShortcuts } = useUiStore();
  return (
    <nav aria-label="Main" className="flex flex-col items-center gap-1 border-r border-hairline bg-twilight py-3">
      <RailLink to="/ops/map" label="Map" icon={MapIcon} />
      <RailLink to="/ops/incidents" label="Incidents" icon={Siren} />
      {(role === "SUPERVISOR" || role === "ADMIN") && <RailLink to="/ops/fleet" label="Fleet health" icon={Activity} />}
      <div className="mt-auto flex flex-col gap-1">
        {isMock && <RailButton label="Demo Director" hint="Shift D" icon={Clapperboard} onClick={() => setDirector(true)} />}
        <RailButton label="Keyboard shortcuts" hint="?" icon={Keyboard} onClick={() => setShortcuts(true)} />
      </div>
    </nav>
  );
}
