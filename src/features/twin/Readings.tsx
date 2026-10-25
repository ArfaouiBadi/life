import type { HomeDetail, TelemetrySnapshot } from "@/api/contracts";
import { StatusGlyph } from "@/components/hg/status";
import { Sparkline } from "@/components/hg/Sparkline";
import { useTelemetryStore } from "@/stores/telemetryStore";
import { num } from "@/lib/format";

/** Per-room readings as hairline rows; numbers right-aligned, condensed. */
export function RoomReadings({ home, live }: { home: HomeDetail; live: TelemetrySnapshot | undefined }) {
  const series = useTelemetryStore((s) => s.series[home.id]);
  if (!live) return null;
  const rooms = home.rooms.filter((r) => r.type !== "CORRIDOR");
  return (
    <table className="mt-4 w-full text-[13px]">
      <caption className="sr-only">Room readings</caption>
      <thead className="text-mist">
        <tr className="border-b border-hairline">
          <th className="py-1.5 text-left font-normal">Room</th>
          <th className="py-1.5 pl-4 text-right font-normal">Oxygen kPa</th>
          <th className="py-1.5 pl-4 text-right font-normal">CO₂ ppm</th>
          <th className="py-1.5 pl-4 text-right font-normal">Pressure kPa</th>
          <th className="py-1.5 pl-4 text-right font-normal">°C</th>
          <th className="py-1.5 pl-4 text-right font-normal">Leak sensor</th>
          <th className="py-1.5 pl-4 text-left font-normal">Last 10 minutes</th>
        </tr>
      </thead>
      <tbody className="w-condensed tabular">
        {rooms.map((room) => {
          const r = live.rooms.find((x) => x.roomId === room.id);
          if (!r) return null;
          const hist = (series ?? []).slice(-300).map((s) => s.rooms.find((x) => x.roomId === room.id)?.ppO2KPa ?? 0);
          return (
            <tr key={room.id} className="border-b border-hairline">
              <td className="py-1.5 pr-2 text-left font-sans" style={{ fontStretch: "100%" }}>
                <span className="inline-flex items-center gap-1.5">
                  <StatusGlyph severity={r.severity} size={11} />
                  {room.name}
                </span>
              </td>
              <td className="py-1.5 pl-4 text-right">{r.ppO2KPa.toFixed(2)}</td>
              <td className="py-1.5 pl-4 text-right">{num(r.co2Ppm)}</td>
              <td className="py-1.5 pl-4 text-right">{r.pressureKPa.toFixed(1)}</td>
              <td className="py-1.5 pl-4 text-right">{r.tempC.toFixed(1)}</td>
              <td className="py-1.5 pl-4 text-right" style={{ color: r.leakAcoustic >= 0.5 ? "var(--color-critical)" : undefined }}>
                {r.leakAcoustic >= 0.5 ? `Hissing ${r.leakAcoustic.toFixed(2)}` : "Quiet"}
              </td>
              <td className="py-1.5 pl-4">
                <Sparkline values={hist} width={110} height={18} threshold={16} min={15.5} max={21.6} color={r.severity === "NOMINAL" ? "var(--color-mist)" : "var(--color-critical)"} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function SystemsStrip({ home, live }: { home: HomeDetail; live: TelemetrySnapshot | undefined }) {
  if (!live) return null;
  const eq = live.equipment.map((e) => ({ ...home.equipment.find((x) => x.id === e.id)!, ...e }));
  return (
    <div className="mt-4 grid grid-cols-4 gap-x-6 gap-y-3 border-t border-hairline pt-4 text-[13px]">
      <Stat label="Battery" value={`${num(live.power.batteryKWh, 1)} of ${home.batteryCapKWh} kWh`} sub={`Solar ${num(live.power.solarKW, 1)} kW, load ${num(live.power.loadKW, 1)} kW${live.power.loadsShed ? ", saving power" : ""}`} />
      <Stat label="Water" value={`${num(live.water.tankL)} of ${num(home.waterTankCapL)} L`} sub={`Recycling ${num(live.water.recyclePct)}%`} />
      <Stat label="Emergency oxygen" value={`${num(live.o2ReservePct)}%`} sub="20 minutes at full flow" />
      <div>
        <div className="text-mist">Equipment</div>
        <ul className="mt-0.5 space-y-0.5">
          {eq
            .filter((e) => e.healthPct < 85 || e.status !== "OK")
            .map((e) => (
              <li key={e.id} className="flex items-center gap-1.5">
                <StatusGlyph severity={e.status === "FAILED" ? "CRITICAL" : e.healthPct < 70 ? "WARNING" : "ADVISORY"} size={11} />
                {e.name} <span className="tabular text-mist">{num(e.healthPct)}%</span>
              </li>
            ))}
          {eq.every((e) => e.healthPct >= 85 && e.status === "OK") && <li className="text-mist">All healthy</li>}
        </ul>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <div className="text-mist">{label}</div>
      <div className="tabular font-[560]">{value}</div>
      <div className="text-mist">{sub}</div>
    </div>
  );
}
