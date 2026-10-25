import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, realtime } from "@/api";
import { topics } from "@/api/RealtimeClient";
import type { Id, Prediction, TelemetrySnapshot } from "@/api/contracts";
import { useTelemetryStore } from "@/stores/telemetryStore";
import { useFleetStore } from "@/stores/fleetStore";

export const useSettlements = () => useQuery({ queryKey: ["settlements"], queryFn: () => api.listSettlements(), staleTime: 5_000 });

export const useSettlement = (code: string | undefined) =>
  useQuery({ queryKey: ["settlement", code], queryFn: () => api.getSettlementByCode(code!), enabled: !!code });

export const useDomes = (settlementId: Id | undefined) =>
  useQuery({ queryKey: ["domes", settlementId], queryFn: () => api.listDomes(settlementId!), enabled: settlementId !== undefined, staleTime: 5_000 });

export const useFeatures = (settlementId: Id | undefined) =>
  useQuery({ queryKey: ["features", settlementId], queryFn: () => api.listMapFeatures(settlementId!), enabled: settlementId !== undefined, staleTime: Infinity });

export const useHomes = (domeId: Id | undefined) =>
  useQuery({ queryKey: ["homes", domeId], queryFn: () => api.listHomes(domeId!), enabled: domeId !== undefined, staleTime: Infinity });

export const useHome = (code: string | undefined) =>
  useQuery({ queryKey: ["home", code], queryFn: () => api.getHomeByCode(code!), enabled: !!code, staleTime: Infinity });

export const useIncidentBundle = (code: string | undefined) =>
  useQuery({ queryKey: ["incident", code], queryFn: () => api.getIncidentByCode(code!), enabled: !!code, staleTime: 2_000 });

export const usePlaybooks = () => useQuery({ queryKey: ["playbooks"], queryFn: () => api.listPlaybooks(), staleTime: Infinity });
export const useWorkOrders = () => useQuery({ queryKey: ["workOrders"], queryFn: () => api.listWorkOrders(), staleTime: 5_000 });
export const useSubscriptions = () => useQuery({ queryKey: ["subscriptions"], queryFn: () => api.listSubscriptions(), staleTime: Infinity });

/** Subscribes to a home's full telemetry and predictions while mounted (the engine only publishes watched homes). */
export function useHomeLive(homeId: Id | undefined) {
  useEffect(() => {
    if (homeId === undefined) return;
    const store = useTelemetryStore.getState();
    const offT = realtime.subscribe<TelemetrySnapshot>(topics.telemetry(homeId), (s) => store.push(s));
    const offP = realtime.subscribe<Prediction[]>(topics.predictions(homeId), (p) => store.setPredictions(homeId, p));
    const now = useFleetStore.getState().simTimeMs ?? Date.now();
    void api.getTelemetryHistory(homeId, new Date(now - 30 * 60_000).toISOString(), new Date(now + 60_000).toISOString()).then((h) => store.seedSeries(homeId, h));
    void api.listPredictions(homeId).then((p) => store.setPredictions(homeId, p));
    return () => {
      offT();
      offP();
    };
  }, [homeId]);
  const latest = useTelemetryStore((s) => (homeId === undefined ? undefined : s.latest[homeId]));
  const predictions = useTelemetryStore((s) => (homeId === undefined ? undefined : s.predictions[homeId]));
  return { latest, predictions: predictions ?? [] };
}

/** Live status of one home from the fleet stream. */
export const useHomeStatus = (homeId: Id | undefined) => useFleetStore((s) => (homeId === undefined ? undefined : s.status[homeId]));

export const useSimNow = () => useFleetStore((s) => s.simTimeMs);
