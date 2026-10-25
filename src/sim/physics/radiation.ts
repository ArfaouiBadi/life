import { PHYS } from "./constants";
import type { SimRegionalEvent } from "../world/types";

export const SPE_PEAK = 40;
export const SPE_RAMP_S = 600;
export const SPE_HOLD_S = 7200;
export const SPE_DECAY_S = 3600;

/** Dose multiplier of a solar particle event at sim time t: ramp 10 min, hold 2 h, decay 1 h. */
export function speMultiplier(ev: Pick<SimRegionalEvent, "rampUntil" | "holdUntil" | "decayUntil" | "baseIntensity">, t: number) {
  const peak = ev.baseIntensity;
  if (t < ev.rampUntil) return 1 + (peak - 1) * (1 - (ev.rampUntil - t) / SPE_RAMP_S);
  if (t < ev.holdUntil) return peak;
  if (t < ev.decayUntil) return 1 + (peak - 1) * ((ev.decayUntil - t) / SPE_DECAY_S);
  return 1;
}

export const roomDose = (multiplier: number, shielding: number) => PHYS.BASE_DOSE_USVH * multiplier * shielding;
