import type { Id } from "./contracts";

export type RealtimeStatus = "CONNECTING" | "OPEN" | "CLOSED";

export interface RealtimeClient {
  connect(): Promise<void>;
  disconnect(): void;
  status(): RealtimeStatus;
  onStatusChange(cb: (s: RealtimeStatus) => void): () => void;
  subscribe<T>(topic: string, handler: (msg: T) => void): () => void;
}

export const topics = {
  clock: "/topic/sim/clock",
  fleetStatus: "/topic/fleet/status",
  fleetSummary: "/topic/fleet/summary",
  telemetry: (homeId: Id) => `/topic/homes/${homeId}/telemetry`,
  predictions: (homeId: Id) => `/topic/homes/${homeId}/predictions`,
  alerts: "/topic/alerts",
  incidents: "/topic/incidents",
  playbookRuns: "/topic/playbook-runs",
  dispatches: "/topic/dispatches",
  regionalEvents: "/topic/regional-events",
} as const;

export const homeIdFromTopic = (topic: string): Id | null => {
  const m = /^\/topic\/homes\/(\d+)\//.exec(topic);
  return m ? Number(m[1]) : null;
};
