import { create } from "zustand";
import type { Id, Prediction, TelemetrySnapshot } from "@/api/contracts";

interface TelemetryState {
  latest: Record<Id, TelemetrySnapshot>;
  predictions: Record<Id, Prediction[]>;
  /** Rolling client-side series for sparklines (last ~10 min of ticks). */
  series: Record<Id, TelemetrySnapshot[]>;
  push: (s: TelemetrySnapshot) => void;
  setPredictions: (homeId: Id, p: Prediction[]) => void;
  seedSeries: (homeId: Id, s: TelemetrySnapshot[]) => void;
}

const MAX_SERIES = 600;

export const useTelemetryStore = create<TelemetryState>((set) => ({
  latest: {},
  predictions: {},
  series: {},
  push: (snap) =>
    set((s) => {
      const prev = s.series[snap.homeId] ?? [];
      const series = prev.length >= MAX_SERIES ? [...prev.slice(prev.length - MAX_SERIES + 1), snap] : [...prev, snap];
      return { latest: { ...s.latest, [snap.homeId]: snap }, series: { ...s.series, [snap.homeId]: series } };
    }),
  setPredictions: (homeId, p) => set((s) => ({ predictions: { ...s.predictions, [homeId]: p } })),
  seedSeries: (homeId, list) =>
    set((s) => {
      const have = s.series[homeId] ?? [];
      const seen = new Set(have.map((x) => x.ts));
      const merged = [...list.filter((x) => !seen.has(x.ts)), ...have].sort((a, b) => a.ts.localeCompare(b.ts)).slice(-MAX_SERIES);
      return { series: { ...s.series, [homeId]: merged } };
    }),
}));
