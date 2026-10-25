import { PHYS } from "../physics/constants";

export type Pt = { t: number; v: number };

/** Least-squares fit of ln(v) = a − k·t. Returns k (1/s) and R². */
export function fitExpDecay(samples: Pt[]) {
  const pts = samples.filter((s) => s.v > 0);
  const n = pts.length;
  if (n < 8) return null;
  const xs = pts.map((p) => p.t);
  const ys = pts.map((p) => Math.log(p.v));
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx; // slope of ln(P) over time = −k
  const r2 = syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  return { k: -slope, r2, n };
}

/** Ordinary least squares v = a + b·t. */
export function fitLinear(samples: Pt[]) {
  const n = samples.length;
  if (n < 8) return null;
  const mx = samples.reduce((a, s) => a + s.t, 0) / n;
  const my = samples.reduce((a, s) => a + s.v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const s of samples) {
    const dx = s.t - mx, dy = s.v - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx, r2: syy === 0 ? 0 : (sxy * sxy) / (sxx * syy), n };
}

export function secondsToThreshold(current: number, threshold: number, k: number): number | null {
  if (current <= threshold) return 0;
  if (k <= 1e-9) return null; // not decaying, so stable
  return Math.log(current / threshold) / k;
}

/** Linear time until a rising value reaches `threshold`. */
export function linearSecondsTo(current: number, threshold: number, slope: number): number | null {
  if (current >= threshold) return 0;
  if (slope <= 1e-9) return null;
  return (threshold - current) / slope;
}

export function estimateLeakAreaCm2(k: number, zoneVolumeM3: number) {
  return ((k * zoneVolumeM3) / PHYS.LEAK_SPEED) * 1e4; // inverts k = 121.2·A/V
}

/**
 * Index of the first sample after a decay began. A window that still holds flat, pre-breach
 * readings would make the fit underestimate k, so the fit starts where pressure left its plateau.
 */
export function onsetIndex(values: number[], sigma: number): number {
  const n = values.length;
  if (n < 16) return 0;
  const head = values.slice(0, 8).sort((a, b) => a - b);
  const plateau = (head[3] + head[4]) / 2;
  const tail = values.slice(-4).reduce((a, b) => a + b, 0) / 4;
  if (plateau - tail < 6 * sigma) return 0;
  for (let i = n - 1; i >= 0; i--) if (values[i] >= plateau - 3 * sigma) return Math.min(i, n - 8);
  return 0;
}
