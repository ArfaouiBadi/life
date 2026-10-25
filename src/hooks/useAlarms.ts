import { useEffect, useRef } from "react";
import { sevRank } from "@/api/contracts";
import { useIncidentStore } from "@/stores/incidentStore";
import { playCritical, playEmergency, playWarning } from "@/lib/sound";

/** One tone per new or escalated incident; emergencies chime every 4 s until acknowledged. */
export function useAlarms() {
  const incidents = useIncidentStore((s) => s.incidents);
  const last = useRef(new Map<number, number>());
  const primed = useRef(false);

  useEffect(() => {
    let loudest = -1;
    for (const i of Object.values(incidents)) {
      const rank = i.status === "RESOLVED" ? -1 : sevRank(i.severity);
      const prev = last.current.get(i.id) ?? -1;
      last.current.set(i.id, rank);
      if (rank > prev) loudest = Math.max(loudest, rank);
    }
    // Don't chime for everything that was already open when the console loaded.
    if (!primed.current) {
      primed.current = Object.keys(incidents).length > 0;
      return;
    }
    if (loudest === 4) playEmergency();
    else if (loudest === 3) playCritical();
    else if (loudest === 2) playWarning();
  }, [incidents]);

  useEffect(() => {
    const id = setInterval(() => {
      const open = Object.values(useIncidentStore.getState().incidents);
      if (open.some((i) => i.severity === "EMERGENCY" && i.status !== "RESOLVED" && !i.acknowledgedAt)) playEmergency();
    }, 4000);
    return () => clearInterval(id);
  }, []);
}
