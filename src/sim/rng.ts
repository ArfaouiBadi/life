export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  return function next() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const range = (rng: Rng, min: number, max: number) => min + (max - min) * rng();
export const int = (rng: Rng, min: number, max: number) => Math.floor(range(rng, min, max + 1));
export const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)];
export const chance = (rng: Rng, p: number) => rng() < p;

/** Box–Muller. */
export function gaussian(rng: Rng, sigma = 1): number {
  const u = 1 - rng();
  const v = rng();
  return sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function weighted<T>(rng: Rng, items: readonly { item: T; w: number }[]): T {
  const total = items.reduce((a, b) => a + b.w, 0);
  let r = rng() * total;
  for (const x of items) {
    r -= x.w;
    if (r <= 0) return x.item;
  }
  return items[items.length - 1].item;
}

export function shuffle<T>(rng: Rng, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
