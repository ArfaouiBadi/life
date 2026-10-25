import type { HabitatApi } from "../HabitatApi";
import type { RealtimeClient } from "../RealtimeClient";
import { StompRealtime } from "./StompRealtime";
import { HttpError } from "../errors";

const BASE = import.meta.env.VITE_API_BASE ?? "/api";

// Stub until phase 11: every call fails loudly so a missing backend is obvious, never silent.
const notYet = (name: string) => () => Promise.reject(new HttpError(501, `${name} is not connected to the backend yet. Reload with ?source=mock.`));

export function createHttpAdapters(): { api: HabitatApi; realtime: RealtimeClient } {
  const api = new Proxy({} as HabitatApi, {
    get: (_t, prop: string) => (prop === "sim" ? new Proxy({}, { get: (_s, p: string) => notYet(`sim.${p}`) }) : notYet(`${prop} (${BASE})`)),
  });
  return { api, realtime: new StompRealtime() };
}
