import { useNavigate } from "react-router";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSessionStore } from "@/stores/sessionStore";
import { useUiStore } from "@/stores/uiStore";
import { ROLE_WORD } from "@/lib/format";
import { initialsOf } from "@/lib/people";

export function UserMenu() {
  const session = useSessionStore((s) => s.session);
  const signOut = useSessionStore((s) => s.signOut);
  const { presentation, togglePresentation } = useUiStore();
  const navigate = useNavigate();
  if (!session) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex items-center rounded-control p-1 hover:bg-dusk-high" aria-label={`Signed in as ${session.user.name}`}>
          <span className="grid size-7 place-items-center rounded-full bg-dusk-high text-xs font-[650]">{initialsOf(session.user.name)}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <span className="block font-[560] text-glass">{session.user.name}</span>
          <span className="block font-normal text-mist">{ROLE_WORD[session.user.role]}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate("/login")}>Switch identity</DropdownMenuItem>
        <DropdownMenuItem onSelect={togglePresentation}>{presentation ? "Leave presentation mode" : "Presentation mode"} (P)</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate("/demo")}>Open the pitch view</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            signOut();
            navigate("/login");
          }}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
