import { SOL_S } from "@/lib/marsTime";

/** Recovery falls off once the recycler drops below 90% health; 98% when healthy, 0 when failed. */
export function recyclePct(healthPct: number, failed: boolean) {
  if (failed) return 0;
  return Math.max(0, 98 - Math.max(0, 90 - healthPct) * 1.5);
}

/** Net water loss in L/s. */
export const netLossLps = (occupants: number, useLSol: number, recycle: number) =>
  (occupants * useLSol * (1 - recycle / 100)) / SOL_S;

export const waterSecondsToEmpty = (tankL: number, lossLps: number) => (lossLps <= 0 ? null : tankL / lossLps);
