import { useNavigate } from "react-router";
import { toast } from "sonner";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { StatusGlyph } from "@/components/hg/status";
import { useUiStore } from "@/stores/uiStore";
import { useIncidentStore } from "@/stores/incidentStore";
import { useFleetStore } from "@/stores/fleetStore";
import { useDirectory } from "@/hooks/useDirectory";
import { api, isMock } from "@/api";

/** Ctrl/⌘ K: homes, households, people's names, settlements, domes, incidents, actions. */
export function CommandPalette() {
  const { paletteOpen, setPalette, toggleMute, muted } = useUiStore();
  const { data: dir } = useDirectory();
  const incidents = useIncidentStore((s) => s.incidents);
  const status = useFleetStore((s) => s.status);
  const navigate = useNavigate();
  const go = (path: string) => {
    setPalette(false);
    navigate(path);
  };
  const hero = dir?.homeByCode.get("JZR-AUR-014");

  return (
    <CommandDialog open={paletteOpen} onOpenChange={setPalette} title="Search" description="Search homes, people, places and actions">
      <CommandInput placeholder="Search homes, households, places or actions" />
      <CommandList>
        <CommandEmpty>Nothing matches. Try a home code like JZR-AUR-014 or a family name.</CommandEmpty>
        <CommandGroup heading="Places">
          {dir?.settlements.map((s) => (
            <CommandItem key={s.code} value={`Go to ${s.name} ${s.featureName}`} onSelect={() => go(`/ops/map/${s.code}`)}>
              Go to {s.name}
              <span className="serif-feature text-mist">{s.featureName}</span>
            </CommandItem>
          ))}
          {dir?.domes.map((d) => {
            const s = dir.settlements.find((x) => x.id === d.settlementId)!;
            return (
              <CommandItem key={d.id} value={`${d.name} dome ${s.name}`} onSelect={() => go(`/ops/map/${s.code}/${d.code}`)}>
                {d.name} dome <span className="text-mist">{s.name}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
        <CommandGroup heading="Open incidents">
          {Object.values(incidents)
            .filter((i) => i.status !== "RESOLVED")
            .map((i) => (
              <CommandItem key={i.id} value={`Open incident ${i.code} ${i.title}`} onSelect={() => go(`/ops/incidents/${i.code}`)}>
                <StatusGlyph severity={i.severity} size={12} />
                {i.title} <span className="w-condensed text-mist">{i.code}</span>
              </CommandItem>
            ))}
        </CommandGroup>
        <CommandGroup heading="Actions">
          <CommandItem value="Mute alarms unmute" onSelect={() => (toggleMute(), setPalette(false))}>
            {muted ? "Unmute alarms" : "Mute alarms"}
          </CommandItem>
          {isMock && hero && (
            <CommandItem
              value="Start a breach in JZR-AUR-014 Bedroom 2 demo"
              onSelect={() => {
                setPalette(false);
                void api.sim.injectScenario({ kind: "BREACH", homeId: hero.id, intensity: 1.5 }).then(() => toast("Breach started in JZR-AUR-014, Bedroom 2"));
              }}
            >
              Start a breach in JZR-AUR-014, Bedroom 2
            </CommandItem>
          )}
        </CommandGroup>
        <CommandGroup heading="Homes">
          {dir?.homes.map((h) => (
            <CommandItem key={h.id} value={`${h.code} ${h.householdName} ${h.dome.name} ${h.settlement.name}`} onSelect={() => go(`/ops/homes/${h.code}`)}>
              <StatusGlyph severity={status[h.id]?.severity ?? h.severity} link={status[h.id]?.link} size={12} />
              <span className="w-condensed tabular">{h.code}</span>
              {h.householdName}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
