import { Outlet } from "react-router";
import { TopStrip } from "./TopStrip";
import { LeftRail } from "./LeftRail";
import { IncidentColumn } from "@/features/incidents/IncidentColumn";
import { CriticalBanner } from "@/features/incidents/CriticalBanner";
import { useUiStore } from "@/stores/uiStore";
import { useOpsShortcuts } from "@/hooks/useOpsShortcuts";
import { CommandPalette } from "@/features/command/CommandPalette";
import { ShortcutsDialog } from "@/features/command/ShortcutsDialog";
import { DemoDirector } from "@/features/demo/DemoDirector";

/** Map full bleed; chrome docked to the edges: top strip, left rail, incident column. */
export function OpsLayout() {
  const columnOpen = useUiStore((s) => s.incidentColumnOpen);
  useOpsShortcuts();
  return (
    <div className="grid h-dvh overflow-hidden bg-twilight text-glass" style={{ gridTemplateColumns: `56px minmax(0,1fr) ${columnOpen ? "360px" : "44px"}` }}>
      <LeftRail />
      <div className="relative flex min-w-0 flex-col">
        <TopStrip />
        <CriticalBanner />
        <main className="relative min-h-0 flex-1" id="main">
          <Outlet />
        </main>
      </div>
      <IncidentColumn />
      <CommandPalette />
      <ShortcutsDialog />
      <DemoDirector />
    </div>
  );
}
