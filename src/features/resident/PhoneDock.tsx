import { useState } from "react";
import { X } from "lucide-react";
import { PhoneFrame } from "@/components/hg/PhoneFrame";
import { useUiStore } from "@/stores/uiStore";
import { ResidentPhone, type ResidentTab } from "./ResidentPhone";

/** The Trabelsi family's phone, docked beside the console for the pitch. */
export function PhoneDock() {
  const setPhoneDock = useUiStore((s) => s.setPhoneDock);
  const [tab, setTab] = useState<ResidentTab>("home");
  return (
    <aside className="flex min-h-0 flex-col border-l border-hairline bg-[#0B1424] px-4 pb-4 pt-3" aria-label="Amira's phone">
      <div className="mb-2 flex items-center justify-between text-mist">
        <span>Amira's phone</span>
        <button type="button" onClick={() => setPhoneDock(false)} aria-label="Hide the phone" className="grid size-7 place-items-center rounded-control hover:bg-dusk-high hover:text-glass">
          <X className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <PhoneFrame>
          <ResidentPhone homeCode="JZR-AUR-014" viewerName="Amira Trabelsi" tab={tab} onTab={setTab} />
        </PhoneFrame>
      </div>
    </aside>
  );
}
