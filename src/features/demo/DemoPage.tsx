import { useEffect } from "react";
import { useNavigate } from "react-router";
import { api, setActor } from "@/api";
import { useSessionStore } from "@/stores/sessionStore";
import { useUiStore } from "@/stores/uiStore";
import { unlockAudio } from "@/lib/sound";
import { Loading } from "@/components/hg/Loading";

/** /demo: signs in as the operator if needed, docks the family's phone beside the console, enables beats. */
export default function DemoPage() {
  const navigate = useNavigate();
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const store = useSessionStore.getState();
      const role = store.session?.user.role;
      if (role !== "OPERATOR" && role !== "SUPERVISOR") {
        const s = await api.login("OPS");
        store.signIn(s);
        setActor(s.user.name);
      }
      if (cancelled) return;
      const ui = useUiStore.getState();
      ui.setPhoneDock(true);
      ui.setBeatMode(true);
      ui.setIncidentColumn(false); // room for the map and the phone on a 1280 projector
      navigate("/ops/map", { replace: true });
    })();
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => {
      cancelled = true;
    };
  }, [navigate]);
  return <Loading label="Setting up the pitch view" className="min-h-dvh bg-twilight" />;
}
