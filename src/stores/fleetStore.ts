import { create } from "zustand";
import type { FleetStatusMessage, FleetSummary, Id } from "@/api/contracts";

export type HomeStatus = FleetStatusMessage["homes"][number];

interface FleetState {
  simTimeMs: number | null;
  speed: number;
  status: Record<Id, HomeStatus>;
  summary: FleetSummary | null;
  setClock: (simTime: string, speed: number) => void;
  applyStatus: (msg: FleetStatusMessage) => void;
  setSummary: (s: FleetSummary) => void;
}

const sameRooms = (a: HomeStatus["roomSeverities"], b: HomeStatus["roomSeverities"]) =>
  a.length === b.length && a.every((r, i) => r.severity === b[i].severity);

export const useFleetStore = create<FleetState>((set, get) => ({
  simTimeMs: null,
  speed: 1,
  status: {},
  summary: null,
  setClock: (simTime, speed) => set({ simTimeMs: Date.parse(simTime), speed }),
  // Keeps the previous object when nothing visible changed, so a tile's selector
  // returns the same reference and only changed homes re-render.
  applyStatus: (msg) => {
    const prev = get().status;
    const next: Record<Id, HomeStatus> = {};
    let changed = false;
    for (const h of msg.homes) {
      const p = prev[h.id];
      const sameTtd = p && (p.ttdSeconds === null) === (h.ttdSeconds === null) && Math.abs((p.ttdSeconds ?? 0) - (h.ttdSeconds ?? 0)) < 1;
      if (p && p.severity === h.severity && p.link === h.link && sameTtd && sameRooms(p.roomSeverities, h.roomSeverities)) next[h.id] = p;
      else {
        next[h.id] = h;
        changed = true;
      }
    }
    if (changed || Object.keys(prev).length !== msg.homes.length) set({ status: next });
  },
  setSummary: (summary) => set({ summary }),
}));
