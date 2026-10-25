import { contours, geoPath, geoIdentity } from "d3";
import { createNoise2D } from "simplex-noise";
import { mulberry32 } from "@/lib/mulberry32";

// Local terrain for each settlement's 4,000 × 2,600 m frame, drawn as survey contours.
// Each place gets the geology it is named after. Visual only.

export interface TerrainLabel {
  name: string;
  x: number;
  y: number;
  angle?: number;
}

export interface Terrain {
  paths: { d: string; major: boolean }[];
  labels: TerrainLabel[];
  crater?: { cx: number; cy: number; r: number };
}

const W = 4000;
const H = 2600;
const cache = new Map<string, Terrain>();

function elevationFn(code: string) {
  const n = createNoise2D(mulberry32([...code].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)));
  const fbm = (x: number, y: number) => {
    let e = 0, amp = 1, f = 1 / 900;
    for (let o = 0; o < 4; o++) {
      e += amp * n(x * f, y * f);
      amp *= 0.5;
      f *= 2.05;
    }
    return e;
  };
  const cx = W / 2, cy = H / 2;
  switch (code) {
    case "JZR": // Jezero: crater floor, rim, and the Neretva Vallis delta fan entering from the west.
      return (x: number, y: number) => {
        const d = Math.hypot(x - cx, (y - cy) / 0.92);
        const rim = 60 * Math.exp(-(((d - 1250) / 120) ** 2)) + (d > 1250 ? 35 : 0);
        const fanD = Math.hypot(x - (cx - 1050), y - (cy - 240));
        const fan = d < 1250 ? 22 * Math.exp(-((fanD / 420) ** 2)) * (x < cx - 500 ? 1 : 0.4) : 0;
        const channel = y > cy - 420 && y < cy - 120 && x < cx - 1150 ? -18 * Math.exp(-(((y - (cy - 270)) / 60) ** 2)) : 0;
        return rim + fan + channel + 4 * fbm(x, y);
      };
    case "GLE": // Gale: the lower flank of Aeolis Mons (Mount Sharp) rises to the south-east.
      return (x: number, y: number) => 0.022 * (x * 0.6 + y) + 30 * Math.exp(-((Math.hypot(x - W * 1.05, y - H * 1.1) / 1400) ** 2)) + 6 * fbm(x, y);
    case "ELY": // Elysium: flat plains cut by a Cerberus Fossae fissure.
      return (x: number, y: number) => {
        const t = (x * 0.28 - y + 1650) / 1;
        return -16 * Math.exp(-((t / 55) ** 2)) + 5 * fbm(x, y);
      };
    case "UTP": // Utopia: scalloped depressions over shallow ice.
      return (x: number, y: number) => {
        let e = 6 * fbm(x, y);
        for (const [px, py, r] of [[700, 600, 260], [3300, 700, 300], [3100, 2050, 240], [900, 2050, 220], [2000, 300, 180]])
          e -= 14 * Math.exp(-((Math.hypot(x - px, y - py) / r) ** 2));
        return e;
      };
    default: // Arcadia: ice-rich plains, gently rolling.
      return (x: number, y: number) => 7 * fbm(x, y) + 0.004 * x;
  }
}

const LABELS: Record<string, TerrainLabel[]> = {
  JZR: [
    { name: "Neretva Vallis", x: 420, y: 980, angle: -4 },
    { name: "Western delta", x: 900, y: 1160 },
    { name: "Jezero rim", x: 3460, y: 380, angle: 38 },
  ],
  GLE: [
    { name: "Aeolis Mons", x: 3500, y: 2380, angle: -18 },
    { name: "Bradbury Landing", x: 520, y: 300 },
  ],
  ELY: [{ name: "Cerberus Fossae", x: 2600, y: 1560, angle: 15.6 }],
  UTP: [{ name: "Scalloped depressions", x: 3150, y: 1040 }],
  ARC: [{ name: "Arcadia Planitia", x: 3300, y: 2380 }],
};

export function terrainFor(code: string): Terrain {
  const hit = cache.get(code);
  if (hit) return hit;
  const e = elevationFn(code);
  const step = 40;
  const gw = Math.ceil(W / step) + 1;
  const gh = Math.ceil(H / step) + 1;
  const grid: number[] = new Array(gw * gh);
  let lo = Infinity, hi = -Infinity;
  for (let j = 0; j < gh; j++)
    for (let i = 0; i < gw; i++) {
      const v = e(i * step, j * step);
      grid[j * gw + i] = v;
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  const interval = code === "JZR" ? 6 : 3;
  const thresholds: number[] = [];
  for (let t = Math.ceil(lo / interval) * interval; t < hi; t += interval) thresholds.push(t);
  const path = geoPath(geoIdentity().scale(step));
  const t: Terrain = {
    paths: contours()
      .size([gw, gh])
      .thresholds(thresholds)(grid)
      .map((c) => ({ d: path(c) ?? "", major: Math.round(c.value / interval) % 5 === 0 })),
    labels: LABELS[code] ?? [],
    crater: code === "JZR" ? { cx: W / 2, cy: H / 2, r: 1250 } : undefined,
  };
  cache.set(code, t);
  return t;
}
