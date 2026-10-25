import { interpolateRgb } from "d3";

// Mars sky: butterscotch by day (fine dust scatters red light), blue around the setting sun
// (the same dust forward-scatters blue light near the Sun), near-black at night.
const NIGHT = "#141E33";
const DUSK_BLUE = "#8FB3DC";
const DAY = "#E3A857";
const DAY_HIGH = "#D9A066";

function skyAt(h: number): [string, string] {
  // [top, horizon]
  if (h < 5 || h >= 19.5) return [NIGHT, "#1E2B45"];
  if (h < 6.5) {
    const t = (h - 5) / 1.5;
    return [interpolateRgb(NIGHT, "#5E6F8E")(t), interpolateRgb("#1E2B45", DUSK_BLUE)(t)];
  }
  if (h < 8) {
    const t = (h - 6.5) / 1.5;
    return [interpolateRgb("#5E6F8E", DAY_HIGH)(t), interpolateRgb(DUSK_BLUE, DAY)(t)];
  }
  if (h < 17) return [DAY_HIGH, DAY];
  if (h < 18.5) {
    const t = (h - 17) / 1.5;
    return [interpolateRgb(DAY_HIGH, "#5E6F8E")(t), interpolateRgb(DAY, DUSK_BLUE)(t)];
  }
  const t = (h - 18.5) / 1;
  return [interpolateRgb("#5E6F8E", NIGHT)(t), interpolateRgb(DUSK_BLUE, "#1E2B45")(t)];
}

/** Illustration only: the real color of the Martian sky at the family's local time. */
export function SkyBand({ lmst, children }: { lmst: number; children?: React.ReactNode }) {
  const [top, horizon] = skyAt(lmst);
  const night = lmst < 5.5 || lmst >= 19;
  const sunUp = lmst >= 6 && lmst < 18;
  // Sun position along a shallow arc.
  const p = Math.min(1, Math.max(0, (lmst - 6) / 12));
  const sx = 8 + p * 84;
  const sy = 78 - Math.sin(p * Math.PI) * 52;
  return (
    <div className="relative overflow-hidden" style={{ background: `linear-gradient(${top}, ${horizon})` }}>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {night &&
          [12, 27, 41, 58, 66, 79, 88, 20, 51, 73].map((x, i) => <circle key={i} cx={x} cy={(i * 37) % 60 + 6} r={0.35} fill="#DCEFF5" opacity={0.7} />)}
        {sunUp && (
          <>
            <circle cx={sx} cy={sy} r={9} fill="#DCEFF5" opacity={0.18} />
            <circle cx={sx} cy={sy} r={2.6} fill="#F4F7F8" opacity={0.95} />
          </>
        )}
        {/* Dome on the horizon */}
        <path d="M0,100 L0,90 Q20,84 40,89 T100,86 L100,100Z" fill="#B47A45" opacity={night ? 0.25 : 0.55} />
        <path d="M62,90 A12,9 0 0 1 86,90" fill="none" stroke="#DCEFF5" strokeWidth={0.5} opacity={0.8} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="relative">{children}</div>
    </div>
  );
}
