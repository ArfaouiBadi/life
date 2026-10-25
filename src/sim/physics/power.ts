import { MARS_HOUR_S } from "@/lib/marsTime";
import type { HomeTemplate } from "@/api/contracts";

/** Fraction of clear-sky sunlight that gets through dust of optical depth τ. τ 4 ≈ 0.17. */
export const dustFactor = (tau: number) => Math.min(1, Math.exp(-(tau - 0.5) / 2));

export const solarKW = (peakKW: number, lmst: number, tau: number, health: number) =>
  peakKW * Math.max(0, Math.sin((Math.PI * (lmst - 6)) / 12)) * dustFactor(tau) * health;

// Base loads are lower than the plan's 2.6 / 1.5 kW so a clear sol balances; see DECISIONS.md.
const BASE: Record<HomeTemplate, number> = { FAMILY: 1.8, POD: 0.9 };
const SHED: Record<HomeTemplate, number> = { FAMILY: 1.0, POD: 0.5 };
export const HEATING_KW = 0.8;

export function loadKW(template: HomeTemplate, lmst: number, shed: boolean) {
  const night = lmst < 6 || lmst >= 18;
  return (shed ? SHED[template] : BASE[template]) + (night ? HEATING_KW : 0);
}

/**
 * Walks the battery forward in fixed steps and returns the first time it hits zero,
 * or null if it lasts the whole horizon. netKW(t) = solar − load at t seconds from now.
 */
export function energyBalanceSecondsToEmpty(
  batteryKWh: number,
  capKWh: number,
  netKW: (tSec: number) => number,
  horizonSec = 24 * MARS_HOUR_S,
  stepSec = 600,
): number | null {
  let e = batteryKWh;
  if (e <= 0) return 0;
  for (let t = 0; t < horizonSec; t += stepSec) {
    const net = netKW(t);
    const next = e + (net * stepSec) / 3600;
    if (next <= 0) return t + (e / -net) * 3600; // interpolate inside the step
    e = Math.min(capKWh, next);
  }
  return null;
}
