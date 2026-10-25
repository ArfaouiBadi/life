import { api } from "@/api";
import { queryClient } from "@/app/queryClient";
import type { Directory } from "@/hooks/useDirectory";
import { reseedClientState } from "@/hooks/useRealtimeBridge";
import { useFleetStore } from "@/stores/fleetStore";
import { useIncidentStore } from "@/stores/incidentStore";
import type { NavigateFunction } from "react-router";

export const HERO = "JZR-AUR-014";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(check: () => boolean, timeoutMs = 30_000) {
  const t0 = Date.now();
  while (!check() && Date.now() - t0 < timeoutMs) await sleep(250);
  return check();
}
const dir = () => queryClient.getQueryData<Directory>(["directory"]);
const heroHome = () => dir()?.homeByCode.get(HERO);
const heroIncident = () =>
  Object.values(useIncidentStore.getState().incidents).find((i) => i.homeId === heroHome()?.id && i.type === "PRESSURE_LOSS" && i.status !== "RESOLVED");

export interface Beat {
  id: string;
  title: string;
  says: string;
  run: (navigate: NavigateFunction) => Promise<void>;
}

/** The three moments of the pitch, plus the follow-through. Each can also be triggered by hand. */
export const BEATS: Beat[] = [
  {
    id: "descent",
    title: "The descent",
    says: "A fresh world at 03:10 in New Jezero, then one camera move from the planet down to the Trabelsi home.",
    run: async (navigate) => {
      await api.sim.reset(2061);
      await reseedClientState();
      const jzr = dir()?.settlements.find((s) => s.code === "JZR") ?? (await api.getSettlementByCode("JZR"));
      await api.sim.setLocalTime(jzr.id, 3 + 10 / 60);
      await api.sim.setSpeed(1);
      navigate("/ops/map", { state: { descend: ["JZR", "AUR", HERO] } });
    },
  },
  {
    id: "countdown",
    title: "The countdown",
    says: "A micrometeorite punctures Bedroom 2. Sped up until the fit locks on, then back to real time.",
    run: async (navigate) => {
      const home = heroHome();
      if (!home) return;
      navigate(`/ops/homes/${HERO}`);
      await api.sim.setSpeed(10);
      await api.sim.injectScenario({ kind: "BREACH", homeId: home.id, intensity: 1.5 });
      await until(() => useFleetStore.getState().status[home.id]?.ttdSeconds != null, 25_000);
      await sleep(1500);
      await api.sim.setSpeed(1);
    },
  },
  {
    id: "save",
    title: "The save",
    says: "Acknowledge, run the breach playbook, wait for Youssef to leave, seal the hatch.",
    run: async () => {
      const inc = heroIncident();
      if (!inc) return;
      if (!inc.acknowledgedAt) await api.acknowledgeIncident(inc.id).catch(() => undefined);
      await api.startPlaybook(inc.id).catch(() => undefined);
      await until(() => useIncidentStore.getState().runs[inc.id]?.steps.find((s) => s.code === "CLEAR_ROOM")?.status === "DONE", 60_000);
      const run = useIncidentStore.getState().runs[inc.id];
      if (run?.steps.find((s) => s.code === "SEAL_HATCH")?.status !== "DONE") await api.executeStep(run!.id, "SEAL_HATCH");
    },
  },
  {
    id: "help",
    title: "Help arrives",
    says: "Dispatch the crew and watch the rover cross New Jezero to the house.",
    run: async (navigate) => {
      const inc = heroIncident();
      if (!inc) return;
      const run = useIncidentStore.getState().runs[inc.id];
      if (run && run.steps.find((s) => s.code === "DISPATCH")?.status !== "DONE") await api.executeStep(run.id, "DISPATCH").catch(() => undefined);
      navigate("/ops/map/JZR");
      await api.sim.setSpeed(10);
    },
  },
  {
    id: "safe",
    title: "Safe again",
    says: "Fast-forward through the patch and the five-minute watch until the incident resolves.",
    run: async (navigate) => {
      const inc = heroIncident();
      navigate(`/ops/homes/${HERO}`);
      await api.sim.setSpeed(60);
      if (inc) await until(() => useIncidentStore.getState().incidents[inc.id]?.status === "RESOLVED", 90_000);
      await api.sim.setSpeed(1);
    },
  },
];
