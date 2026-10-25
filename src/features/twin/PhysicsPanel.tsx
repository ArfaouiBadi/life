import { CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Scatter, XAxis, YAxis } from "recharts";
import type { HomeDetail, Prediction, Severity } from "@/api/contracts";
import { TtdCountdown } from "@/components/hg/TtdCountdown";
import { SeverityLabel } from "@/components/hg/status";
import { formatTtd, horizonWords, num } from "@/lib/format";

const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
export function sci(v: number, digits = 2) {
  if (v === 0) return "0";
  const e = Math.floor(Math.log10(Math.abs(v)));
  const m = v / 10 ** e;
  const exp = String(e)
    .split("")
    .map((c) => (c === "-" ? "⁻" : SUP[Number(c)]))
    .join("");
  return `${m.toFixed(digits)} × 10${exp}`;
}

/** The countdown with the physics right beside it: what we measured, the fit, and the arithmetic. */
export function PhysicsPanel({ home, predictions, severity }: { home: HomeDetail; predictions: Prediction[]; severity: Severity }) {
  const o2 = predictions.filter((p) => p.metric === "PPO2_KPA");
  const occupiedFalling = o2.filter((p) => p.occupied && p.secondsToThreshold !== null).sort((a, b) => a.secondsToThreshold! - b.secondsToThreshold!);
  const lead = occupiedFalling[0];
  const emptySealed = o2.filter((p) => !p.occupied && p.secondsToThreshold !== null && p.zoneRoomIds.length === 1);
  const roomName = (id: number) => home.rooms.find((r) => r.id === id)?.name ?? "a room";
  const other = predictions.filter((p) => p.metric !== "PPO2_KPA" && p.metric !== "CO2_PPM" && p.occupied && p.secondsToThreshold !== null && p.secondsToThreshold < 48 * 3600);
  const headline = lead ?? other.sort((a, b) => a.secondsToThreshold! - b.secondsToThreshold!)[0];
  const label = !headline || headline.metric === "PPO2_KPA" ? "Unsafe air in" : headline.metric === "BATTERY_KWH" ? "Battery empty in" : headline.metric === "SMOKE_IDX" ? "Dangerous smoke in" : "Danger in";

  return (
    <section aria-label="Time to danger" className="space-y-5">
      <div>
        <TtdCountdown seconds={headline?.secondsToThreshold ?? null} severity={severity} label={label} size="xl" stableText="Stable" />
        <div className="mt-2 flex items-center gap-3">
          <SeverityLabel severity={severity} link={home.link} />
          {!headline && <span className="text-mist">No reading is heading toward a limit.</span>}
        </div>
      </div>

      {lead && <LeakPhysics p={lead} home={home} />}

      {emptySealed.map((p) => (
        <p key={p.id} className="border-l-2 border-hairline pl-3 text-mist">
          {roomName(p.zoneRoomIds[0])} is sealed and empty. Its own air reaches unsafe in{" "}
          <span className="tabular text-glass">{formatTtd(p.secondsToThreshold!)}</span>, and nobody is breathing it.
        </p>
      ))}

    </section>
  );
}

function LeakPhysics({ p, home }: { p: Prediction; home: HomeDetail }) {
  const d = p.details;
  const rooms = p.zoneRoomIds.length;
  const k = d.k ?? 0;
  const ttd = p.secondsToThreshold ?? 0;
  const allRooms = rooms >= home.rooms.filter((r) => r.type !== "AIRLOCK").length;

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
        <dt className="text-mist">Leak size</dt>
        <dd className="tabular">
          about {(d.leakAreaCm2 ?? 0).toFixed(1)} cm² <span className="text-mist">estimated from k</span>
        </dd>
        <dt className="text-mist">Decay rate k</dt>
        <dd className="tabular">
          {sci(k)} /s{" "}
          <span className="text-mist">
            R² {(d.r2 ?? p.confidence).toFixed(2)}, {num(d.samples ?? 0)} samples
          </span>
        </dd>
        <dt className="text-mist">Air at risk</dt>
        <dd className="tabular">
          {num(d.zoneVolumeM3 ?? 0, 1)} m³ <span className="text-mist">{allRooms ? "every hatch open" : `${rooms} rooms joined by open hatches`}</span>
        </dd>
        <dt className="text-mist">Oxygen</dt>
        <dd className="tabular">
          {p.current.toFixed(2)} kPa now, unsafe below {p.threshold.toFixed(1)} kPa
        </dd>
      </dl>
      <p className="rounded-instrument border border-hairline px-3 py-2 tabular text-[15px]">
        t = ln({p.current.toFixed(2)} ÷ {p.threshold.toFixed(1)}) ÷ k = <span className="font-[650]">{formatTtd(ttd)}</span>
      </p>
    </div>
  );
}

export function SystemsForecast({ predictions }: { predictions: Prediction[] }) {
  const battery = predictions.find((p) => p.metric === "BATTERY_KWH");
  const water = predictions.find((p) => p.metric === "WATER_L");
  const co2 = predictions.filter((p) => p.metric === "CO2_PPM").sort((a, b) => b.current - a.current)[0];
  const rows: [string, string][] = [];
  if (co2) rows.push(["Carbon dioxide", `${num(co2.current)} ppm, ${co2.trend === "RISING" ? "rising" : co2.trend === "FALLING" ? "falling" : "steady"}`]);
  if (battery)
    rows.push([
      "Battery",
      battery.secondsToThreshold === null ? `${num(battery.current, 1)} kWh, lasts the next sol` : `${num(battery.current, 1)} kWh, empty in ${horizonWords(battery.secondsToThreshold)}`,
    ]);
  if (water) rows.push(["Water", water.secondsToThreshold === null ? `${num(water.current)} L, steady` : `${num(water.current)} L, lasts ${horizonWords(water.secondsToThreshold)}`]);
  if (!rows.length) return null;
  return (
    <dl className="grid content-start grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-mist">{k}</dt>
          <dd className="tabular">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Measured oxygen (dots) and the fitted exponential (line) extrapolated to the unsafe threshold. */
export function FitChart({ predictions }: { predictions: Prediction[] }) {
  const p = predictions
    .filter((x) => x.metric === "PPO2_KPA" && x.occupied && x.secondsToThreshold !== null)
    .sort((a, b) => a.secondsToThreshold! - b.secondsToThreshold!)[0];
  if (!p) return null;
  const k = p.details.k ?? 0;
  const pts = p.fitSeries ?? [];
  const tNow = pts.length ? pts[pts.length - 1].t : 0;
  const ttd = p.secondsToThreshold ?? 0;
  const t0 = pts.length ? pts[0].t - tNow : -300;
  const curve = Array.from({ length: 41 }, (_, i) => {
    const t = t0 + ((ttd - t0) * i) / 40;
    return { m: t / 60, fit: p.current * Math.exp(-k * t) };
  });
  const measured = pts.filter((_, i) => i % Math.max(1, Math.floor(pts.length / 60)) === 0).map((s) => ({ m: (s.t - tNow) / 60, v: s.v }));
  return (
    <figure>
      <figcaption className="text-mist">Oxygen measured (dots) and the fitted decay (line), until it crosses unsafe</figcaption>
        <div className="h-40" aria-label="Measured oxygen and the fitted curve">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="var(--color-hairline)" strokeDasharray="2 4" vertical={false} />
              <XAxis
                type="number"
                dataKey="m"
                domain={["dataMin", "dataMax"]}
                tick={{ fill: "var(--color-mist)", fontSize: 11 }}
                tickFormatter={(v: number) => (v === 0 ? "now" : `${v > 0 ? "+" : ""}${Math.round(v)}m`)}
                stroke="var(--color-hairline)"
                allowDuplicatedCategory={false}
              />
              <YAxis domain={[15.5, 21.5]} tick={{ fill: "var(--color-mist)", fontSize: 11 }} stroke="var(--color-hairline)" width={44} tickFormatter={(v: number) => v.toFixed(0)} />
              <ReferenceLine y={p.threshold} stroke="var(--color-critical)" strokeDasharray="4 3" label={{ value: "unsafe", fill: "var(--color-critical)", fontSize: 11, position: "insideBottomLeft" }} />
              <ReferenceLine x={0} stroke="var(--color-mist)" strokeOpacity={0.5} />
              <Line data={curve} dataKey="fit" dot={false} stroke="var(--color-glass)" strokeWidth={1.6} isAnimationActive={false} />
              <Scatter data={measured} dataKey="v" fill="var(--color-mist)" r={1.5} isAnimationActive={false} shape="circle" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
    </figure>
  );
}
