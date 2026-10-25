import type { ZoomTransform } from "d3";
import type { Dome } from "@/api/contracts";

/** Where you are in the settlement. Click to pan there. */
export function Minimap({
  width,
  height,
  domes,
  crater,
  transform: t,
  view,
  onJump,
}: {
  width: number;
  height: number;
  domes: Dome[];
  crater?: { cx: number; cy: number; r: number };
  transform: ZoomTransform;
  view: { w: number; h: number };
  onJump: (x: number, y: number) => void;
}) {
  const mw = 168;
  const s = mw / width;
  const mh = height * s;
  // Visible world rect from the current transform.
  const vx = -t.x / t.k;
  const vy = -t.y / t.k;
  const vw = view.w / t.k;
  const vh = view.h / t.k;
  return (
    <div className="absolute bottom-5 left-6 rounded-instrument border border-hairline bg-dusk/90 p-1.5">
      <svg
        width={mw}
        height={mh}
        role="img"
        aria-label="Minimap"
        className="block cursor-pointer"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          onJump((e.clientX - r.left) / s, (e.clientY - r.top) / s);
        }}
      >
        <rect width={mw} height={mh} fill="#0F1B2D" />
        {crater && <ellipse cx={crater.cx * s} cy={crater.cy * s} rx={crater.r * s} ry={crater.r * 0.92 * s} fill="none" stroke="var(--color-regolith)" strokeOpacity={0.5} />}
        {domes.map((d) => (
          <circle key={d.id} cx={d.centerX * s} cy={d.centerY * s} r={Math.max(2, d.radiusM * s)} fill="none" stroke="var(--color-glass)" strokeOpacity={0.8} />
        ))}
        <rect
          x={Math.max(0, vx * s)}
          y={Math.max(0, vy * s)}
          width={Math.max(4, Math.min(mw, vw * s))}
          height={Math.max(4, Math.min(mh, vh * s))}
          fill="var(--color-glass)"
          fillOpacity={0.08}
          stroke="var(--color-glass)"
          strokeWidth={1}
        />
      </svg>
    </div>
  );
}
