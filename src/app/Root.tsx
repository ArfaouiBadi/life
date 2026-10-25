import { useEffect } from "react";
import { Outlet } from "react-router";
import { setActor } from "@/api";
import { useSessionStore } from "@/stores/sessionStore";
import { useRealtimeBridge } from "@/hooks/useRealtimeBridge";
import { useAlarms } from "@/hooks/useAlarms";
import { LiveAnnouncer } from "@/components/hg/LiveAnnouncer";

/** Mounted once: keeps the stores live, plays alarms, announces incidents to screen readers. */
export function Root() {
  useRealtimeBridge();
  useAlarms();
  const name = useSessionStore((s) => s.session?.user.name);
  useEffect(() => {
    if (name) setActor(name); // audit lines name the person, also after a reload
  }, [name]);
  return (
    <>
      <Outlet />
      <LiveAnnouncer />
    </>
  );
}
