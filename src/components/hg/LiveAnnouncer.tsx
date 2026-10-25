import { useEffect, useRef, useState } from "react";
import { useIncidentStore } from "@/stores/incidentStore";
import { SEVERITY_WORD } from "@/lib/format";

/** aria-live region: new incidents politely, emergencies assertively. */
export function LiveAnnouncer() {
  const [polite, setPolite] = useState("");
  const [assertive, setAssertive] = useState("");
  const seen = useRef(new Map<number, string>());
  const incidents = useIncidentStore((s) => s.incidents);

  useEffect(() => {
    for (const i of Object.values(incidents)) {
      const prev = seen.current.get(i.id);
      seen.current.set(i.id, i.severity);
      if (i.status === "RESOLVED" || prev === i.severity) continue;
      if (prev === undefined && seen.current.size > 0 && i.severity === "ADVISORY") continue;
      const text = `${SEVERITY_WORD[i.severity]}: ${i.title}.`;
      if (i.severity === "EMERGENCY") setAssertive(text);
      else if (i.severity === "CRITICAL" || i.severity === "WARNING") setPolite(text);
    }
  }, [incidents]);

  return (
    <div className="sr-only">
      <div aria-live="polite">{polite}</div>
      <div aria-live="assertive">{assertive}</div>
    </div>
  );
}
