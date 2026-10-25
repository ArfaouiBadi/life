// Axial hex coordinates, pointy-top. Index 0 is the dome's life-support core.
export interface Axial {
  q: number;
  r: number;
}

const DIRS: Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

/** Spiral order: center, then ring 1 (6), ring 2 (12), ring 3 (18) ... */
export function hexSpiral(count: number): Axial[] {
  const out: Axial[] = [{ q: 0, r: 0 }];
  for (let ring = 1; out.length < count; ring++) {
    let h: Axial = { q: DIRS[4].q * ring, r: DIRS[4].r * ring };
    for (let side = 0; side < 6; side++) {
      for (let step = 0; step < ring; step++) {
        out.push(h);
        h = { q: h.q + DIRS[side].q, r: h.r + DIRS[side].r };
      }
    }
  }
  return out.slice(0, count);
}

export const hexRing = (a: Axial) => (Math.abs(a.q) + Math.abs(a.r) + Math.abs(a.q + a.r)) / 2;

/** Center of a pointy-top hex of circumradius `size`. */
export const hexToPixel = (a: Axial, size: number): [number, number] => [
  size * Math.sqrt(3) * (a.q + a.r / 2),
  size * 1.5 * a.r,
];

export function hexCorners(cx: number, cy: number, size: number): [number, number][] {
  return Array.from({ length: 6 }, (_, i) => {
    const ang = (Math.PI / 180) * (60 * i - 30);
    return [cx + size * Math.cos(ang), cy + size * Math.sin(ang)] as [number, number];
  });
}

/** Hex size that fits `homeCount` homes (plus the core) inside a dome of radius `radiusM`. */
export function hexSizeForDome(radiusM: number, homeCount: number) {
  const rings = hexRing(hexSpiral(homeCount + 1)[homeCount]);
  // Outer ring extent ≈ size·√3·rings + size; keep a margin inside the glass.
  return (radiusM * 0.86) / (Math.sqrt(3) * rings + 1);
}

/** Home position in settlement-frame meters. */
export function homeWorldPos(dome: { centerX: number; centerY: number; radiusM: number; homeCount: number }, a: Axial) {
  const size = hexSizeForDome(dome.radiusM, dome.homeCount);
  const [x, y] = hexToPixel(a, size);
  return [dome.centerX + x, dome.centerY + y] as [number, number];
}

export const HEX_NEIGHBORS = DIRS;
