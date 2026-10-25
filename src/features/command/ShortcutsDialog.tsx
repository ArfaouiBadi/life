import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useUiStore } from "@/stores/uiStore";

const KEYS: [string, string][] = [
  ["Ctrl K", "Search homes, people and places"],
  ["Esc", "Up one map level, or close the open panel"],
  ["[ and ]", "Previous and next incident"],
  ["A", "Acknowledge the focused incident"],
  ["R", "Run the focused incident's playbook"],
  ["M", "Mute or unmute alarms"],
  ["P", "Presentation mode"],
  ["Shift D", "Open the Demo Director"],
  ["Space", "Next demo beat (beat mode only)"],
  ["Arrow keys", "Move between homes in a dome"],
  ["?", "Show these shortcuts"],
];

export function ShortcutsDialog() {
  const { shortcutsOpen, setShortcuts } = useUiStore();
  return (
    <Dialog open={shortcutsOpen} onOpenChange={setShortcuts}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Everything in the console works from the keyboard.</DialogDescription>
        </DialogHeader>
        <dl className="divide-y divide-hairline">
          {KEYS.map(([k, v]) => (
            <div key={k} className="flex items-baseline gap-4 py-2">
              <dt className="w-24 shrink-0">
                <kbd className="rounded-control border border-hairline px-1.5 py-0.5 text-xs font-[560]">{k}</kbd>
              </dt>
              <dd className="text-mist">{v}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
