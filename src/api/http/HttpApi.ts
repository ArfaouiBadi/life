import type { Session } from "../contracts";
import type { HabitatApi } from "../HabitatApi";
import type { RealtimeClient } from "../RealtimeClient";
import { HttpError } from "../errors";
import { StompRealtime } from "./StompRealtime";

const BASE: string = import.meta.env.VITE_API_BASE ?? "/api";
const TIMEOUT_MS = 10_000; // a dead request fails loudly instead of leaving a screen waiting

/** Same key as src/stores/sessionStore.ts, read on every call so signing in or out applies at once. */
function sessionToken(): string | null {
  try {
    return (JSON.parse(sessionStorage.getItem("life.session") ?? "null") as Session | null)?.token ?? null;
  } catch {
    return null;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = sessionToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    // No HTTP answer at all (server down, wrong host, timeout): status 0, as browsers report it.
    throw new HttpError(0, `No answer from ${BASE}${path} (${e instanceof Error ? e.message : String(e)}).`);
  }
  const text = await res.text();
  if (!res.ok) {
    let message = "";
    try {
      const err = JSON.parse(text) as { message?: string; detail?: string }; // Spring error body, or a ProblemDetail
      message = err.message || err.detail || "";
    } catch {
      /* not JSON: a proxy or gateway page */
    }
    throw new HttpError(res.status, message || `${method} ${BASE}${path} failed (HTTP ${res.status}).`);
  }
  return (text ? JSON.parse(text) : undefined) as T;
}

const get = <T>(path: string) => request<T>("GET", path);
const post = <T>(path: string, body?: unknown) => request<T>("POST", path, body);
const enc = encodeURIComponent;
const qs = (q: Record<string, string | number | boolean | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

/** HabitatApi over the Spring Boot REST API (mapping in docs/API_CONTRACT.md). */
export const httpApi: HabitatApi = {
  login: (identityCode) => post("/auth/login", { identityCode }),
  getFleetSummary: () => get("/fleet/summary"),
  listSettlements: () => get("/settlements"),
  getSettlementByCode: (code) => get(`/settlements/${enc(code)}`),
  listDomes: (settlementId) => get(`/settlements/${settlementId}/domes`),
  listMapFeatures: (settlementId) => get(`/settlements/${settlementId}/features`),
  listHomes: (domeId) => get(`/domes/${domeId}/homes`),
  getHomeByCode: (code) => get(`/homes/${enc(code)}`),
  getTelemetryHistory: (homeId, from, to) => get(`/homes/${homeId}/telemetry${qs({ from, to })}`),
  listPredictions: (homeId) => get(`/homes/${homeId}/predictions`),
  listAlerts: (q) => get(`/alerts${qs(q)}`),
  acknowledgeAlert: (alertId) => post(`/alerts/${alertId}/ack`),
  listIncidents: (q) => get(`/incidents${qs(q)}`),
  getIncidentByCode: (code) => get(`/incidents/${enc(code)}`),
  acknowledgeIncident: (incidentId) => post(`/incidents/${incidentId}/ack`),
  addIncidentNote: (incidentId, text) => post(`/incidents/${incidentId}/notes`, { text }),
  listPlaybooks: () => get("/playbooks"),
  startPlaybook: (incidentId) => post(`/incidents/${incidentId}/playbook`),
  executeStep: (runId, stepCode) => post(`/playbook-runs/${runId}/steps/${enc(stepCode)}`),
  setHatchState: (homeId, hatchId, state) => request("PUT", `/homes/${homeId}/hatches/${hatchId}`, { state }),
  dispatchCrew: (incidentId) => post(`/incidents/${incidentId}/dispatch`),
  listRegionalEvents: () => get("/regional-events"),
  listWorkOrders: () => get("/work-orders"),
  listSubscriptions: () => get("/subscriptions"),
  sim: {
    injectScenario: (req) => post("/dev/sim/scenarios", req),
    setSpeed: (multiplier) => post("/dev/sim/speed", { multiplier }),
    setLocalTime: (settlementId, lmstHours) => post("/dev/sim/local-time", { settlementId, lmstHours }),
    reset: (seed) => post("/dev/sim/reset", { seed }),
  },
};

/**
 * Checks the backend answers before the first render. If it doesn't, main.tsx shows the error with the
 * ?source=mock link, instead of screens sitting on "Loading" for data that will never come.
 */
export async function createHttpAdapters(): Promise<{ api: HabitatApi; realtime: RealtimeClient }> {
  await httpApi.listSettlements().catch((e: unknown) => {
    if (e instanceof HttpError && (e.status === 401 || e.status === 403)) return; // it answered: it is up
    throw new HttpError(503, `The Life backend at ${BASE} is not available. ${e instanceof Error ? e.message : ""}`);
  });
  return { api: httpApi, realtime: new StompRealtime() };
}
