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
import { PhoneDock } from "@/features/resident/PhoneDock";

/** Map full bleed; chrome docked to the edges: top strip, left rail, incident column. */
export function OpsLayout() {
  const columnOpen = useUiStore((s) => s.incidentColumnOpen);
  const phoneDock = useUiStore((s) => s.phoneDock);
  const presentation = useUiStore((s) => s.presentation);
  useOpsShortcuts();
  return (
    <div
      className="grid overflow-hidden bg-twilight text-glass"
      // CSS zoom (presentation mode) scales heights too, so divide the viewport back out.
      style={{ height: presentation ? "calc(100dvh / 1.12)" : "100dvh", gridTemplateColumns: `56px minmax(0,1fr) ${phoneDock ? "350px " : ""}${columnOpen ? "360px" : "44px"}` }}>
      <LeftRail />
      <div className="relative flex min-w-0 flex-col">
        <TopStrip />
        <CriticalBanner />
        <main className="relative min-h-0 flex-1" id="main">
          <Outlet />
        </main>
      </div>
      {phoneDock && <PhoneDock />}
      <IncidentColumn />
      <CommandPalette />
      <ShortcutsDialog />
      <DemoDirector />
    </div>
  );
}
