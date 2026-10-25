import { useSyncExternalStore } from "react";

const query = () => (typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null);

export const prefersReducedMotion = () => query()?.matches ?? false;

export function useReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      const q = query();
      q?.addEventListener("change", cb);
      return () => q?.removeEventListener("change", cb);
    },
    prefersReducedMotion,
    () => false,
  );
}

/** cubic-bezier(0.2, 0, 0, 1), the emphasized easing, as a JS function (Newton's method). */
export function easeEmphasized(t: number) {
  const x1 = 0.2, y1 = 0, x2 = 0, y2 = 1;
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sampleX = (u: number) => ((ax * u + bx) * u + cx) * u;
  let u = t;
  for (let i = 0; i < 6; i++) {
    const dx = sampleX(u) - t;
    const d = (3 * ax * u + 2 * bx) * u + cx;
    if (Math.abs(d) < 1e-6) break;
    u -= dx / d;
  }
  u = Math.min(1, Math.max(0, u));
  return ((ay * u + by) * u + cy) * u;
}

export const FLIGHT_MS = 1200;
