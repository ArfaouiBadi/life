import type { HabitatApi } from "./HabitatApi";
import type { RealtimeClient } from "./RealtimeClient";
import { createHttpAdapters } from "./http/HttpApi";

export type DataSource = "mock" | "http";

const params = new URLSearchParams(window.location.search);
// ?source=mock is the safety net for the pitch: if the backend fails on stage, reload with it.
export const source: DataSource = (params.get("source") ?? import.meta.env.VITE_DATA_SOURCE ?? "mock") === "http" ? "http" : "mock";
export const isMock = source === "mock";

async function createMockAdapters(): Promise<{ api: HabitatApi; realtime: RealtimeClient }> {
  // Dynamic import keeps the simulation out of the bundle when running against the backend.
  const [{ SimEngine }, { MockApi }, { MockRealtime }] = await Promise.all([
    import("@/sim/engine"),
    import("./mock/MockApi"),
    import("./mock/MockRealtime"),
  ]);
  const seed = Number(params.get("seed") ?? 2061) || 2061;
  const autoRun = Number(params.get("autorun") ?? 20) || 20;
  const realtime = new MockRealtime();
  const engine = new SimEngine(realtime, seed, Date.now(), autoRun);
  engine.start();
  const api = new MockApi(engine);
  (window as unknown as { __life?: unknown }).__life = { engine, api };
  return { api, realtime };
}

export const adaptersReady: Promise<{ api: HabitatApi; realtime: RealtimeClient }> =
  source === "http" ? Promise.resolve(createHttpAdapters()) : createMockAdapters();

/** Filled in once adaptersReady resolves (main.tsx awaits it before rendering). */
export let api: HabitatApi;
export let realtime: RealtimeClient;
adaptersReady.then((a) => {
  api = a.api;
  realtime = a.realtime;
});

/** Mock-only access to the actor name used for audit lines. */
export function setActor(name: string) {
  const a = api as unknown as { setActor?: (n: string) => void };
  a.setActor?.(name);
}
