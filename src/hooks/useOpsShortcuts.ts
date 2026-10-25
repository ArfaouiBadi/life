import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { api, isMock } from "@/api";
import { useUiStore } from "@/stores/uiStore";
import { useIncidentStore } from "@/stores/incidentStore";
import { queryClient } from "@/app/queryClient";
import type { Directory } from "./useDirectory";
import { sortIncidents } from "@/features/incidents/IncidentColumn";

export const isTyping = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
};

/** Global console shortcuts (section 10.4). */
export function useOpsShortcuts() {
  const navigate = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ui = useUiStore.getState();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ui.setPalette(!ui.paletteOpen);
        return;
      }
      if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector("[role=dialog],[role=alertdialog]") && e.key !== "Escape") return;

      const open = Object.values(useIncidentStore.getState().incidents)
        .filter((i) => i.status !== "RESOLVED")
        .sort(sortIncidents);
      const focused = open.find((i) => i.id === ui.focusedIncidentId) ?? open[0];
      const dir = queryClient.getQueryData<Directory>(["directory"]);

      switch (e.key) {
        case "Escape": {
          if (document.querySelector("[role=dialog],[role=alertdialog]")) return;
          const p = loc.pathname.split("/").filter(Boolean);
          if (p[1] === "map" && p.length === 4) navigate(`/ops/map/${p[2]}`);
          else if (p[1] === "map" && p.length === 3) navigate("/ops/map");
          else if (p[1] === "homes") {
            const h = dir?.homeByCode.get(p[2]);
            navigate(h ? `/ops/map/${h.settlement.code}/${h.dome.code}` : "/ops/map");
          } else if (p[1] === "incidents" && p.length === 3) navigate("/ops/incidents");
          break;
        }
        case "[":
        case "]": {
          if (!open.length) return;
          const idx = Math.max(0, open.findIndex((i) => i.id === ui.focusedIncidentId));
          const next = open[(idx + (e.key === "]" ? 1 : open.length - 1)) % open.length];
          ui.focusIncident(next.id);
          const h = next.homeId !== null ? dir?.homeById.get(next.homeId) : undefined;
          navigate(h ? `/ops/homes/${h.code}` : `/ops/incidents/${next.code}`);
          break;
        }
        case "a":
        case "A":
          if (focused && !focused.acknowledgedAt)
            api.acknowledgeIncident(focused.id).then(
              () => toast("Acknowledged", { description: focused.title }),
              (err: Error) => toast.error(err.message),
            );
          break;
        case "r":
        case "R":
          if (focused)
            api.startPlaybook(focused.id).then(
              () => toast("Playbook started", { description: focused.title }),
              (err: Error) => toast.error(err.message),
            );
          break;
        case "m":
        case "M":
          ui.toggleMute();
          break;
        case "p":
        case "P":
          ui.togglePresentation();
          break;
        case "D":
          if (e.shiftKey && isMock) ui.setDirector(!ui.directorOpen);
          break;
        case "?":
          ui.setShortcuts(true);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, loc.pathname]);
}
