/** Tiny custom SVG sparkline (no chart library for these). */
export function Sparkline({
  values,
  width = 96,
  height = 24,
  color = "var(--color-mist)",
  threshold,
  min,
  max,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  threshold?: number;
  min?: number;
  max?: number;
}) {
  if (values.length < 2) return <svg width={width} height={height} aria-hidden />;
  const lo = min ?? Math.min(...values, threshold ?? Infinity);
  const hi = max ?? Math.max(...values, threshold ?? -Infinity);
  const span = hi - lo || 1;
  const x = (i: number) => (i / (values.length - 1)) * width;
  const y = (v: number) => height - 2 - ((v - lo) / span) * (height - 4);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  return (
    <svg width={width} height={height} aria-hidden className="overflow-visible">
      {threshold !== undefined && <line x1={0} x2={width} y1={y(threshold)} y2={y(threshold)} stroke="var(--color-hairline)" strokeDasharray="2 2" />}
      <path d={d} fill="none" stroke={color} strokeWidth={1.4} strokeLinejoin="round" />
    </svg>
  );
}
