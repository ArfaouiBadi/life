/** Point at fraction t (0..1) along a polyline, plus the heading in degrees. */
export function pointAlong(path: [number, number][], t: number): { x: number; y: number; angle: number } {
  if (path.length < 2) return { x: path[0]?.[0] ?? 0, y: path[0]?.[1] ?? 0, angle: 0 };
  const segs = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1]));
  const total = segs.reduce((a, b) => a + b, 0);
  let d = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < segs.length; i++) {
    if (d <= segs[i] || i === segs.length - 1) {
      const f = segs[i] ? Math.min(1, d / segs[i]) : 0;
      const [x0, y0] = path[i];
      const [x1, y1] = path[i + 1];
      return { x: x0 + (x1 - x0) * f, y: y0 + (y1 - y0) * f, angle: (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI };
    }
    d -= segs[i];
  }
  return { x: path[path.length - 1][0], y: path[path.length - 1][1], angle: 0 };
}

export const polyPoints = (pts: [number, number][]) => pts.map((p) => p.join(",")).join(" ");
