import { useMemo } from "react";
import { Link } from "react-router";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Severity } from "@/api/contracts";
import { useDirectory } from "@/hooks/useDirectory";
import { useWorkOrders, useSubscriptions } from "@/hooks/data";
import { useFleetStore } from "@/stores/fleetStore";
import { Loading } from "@/components/hg/Loading";
import { SEV_COLOR, StatusGlyph } from "@/components/hg/status";
import { SEVERITY_PLURAL, num } from "@/lib/format";

const LOUD: Severity[] = ["EMERGENCY", "CRITICAL", "WARNING", "ADVISORY"];

/** Supervisor view: how every settlement and dome is doing, and what maintenance is coming. */
export default function FleetPage() {
  const { data: dir } = useDirectory();
  const status = useFleetStore((s) => s.status);
  const summary = useFleetStore((s) => s.summary);
  const { data: orders } = useWorkOrders();
  const { data: subs } = useSubscriptions();

  const rows = useMemo(() => {
    if (!dir) return [];
    return dir.domes.map((d) => {
      const homes = dir.homes.filter((h) => h.domeId === d.id);
      const counts: Record<Severity, number> = { NOMINAL: 0, ADVISORY: 0, WARNING: 0, CRITICAL: 0, EMERGENCY: 0 };
      let offline = 0;
      for (const h of homes) {
        const s = status[h.id];
        counts[s?.severity ?? h.severity]++;
        if ((s?.link ?? h.link) === "OFFLINE") offline++;
      }
      const s = dir.settlements.find((x) => x.id === d.settlementId)!;
      return { d, s, homes: homes.length, people: homes.reduce((a, h) => a + h.occupantCount, 0), counts, offline, due: orders?.filter((o) => homes.some((h) => h.id === o.homeId) && o.status !== "DONE").length ?? 0 };
    });
  }, [dir, status, orders]);

  const chart = useMemo(
    () =>
      (dir?.settlements ?? []).map((s) => {
        const r = rows.filter((x) => x.s.id === s.id);
        return { name: s.name, ADVISORY: r.reduce((a, x) => a + x.counts.ADVISORY, 0), WARNING: r.reduce((a, x) => a + x.counts.WARNING, 0), CRITICAL: r.reduce((a, x) => a + x.counts.CRITICAL + x.counts.EMERGENCY, 0) };
      }),
    [dir, rows],
  );
  const mrr = subs?.filter((s) => s.status !== "PAST_DUE").reduce((a, s) => a + s.monthlyPrice, 0) ?? 0;

  if (!dir) return <Loading label="Gathering the fleet" />;
  return (
    <div className="absolute inset-0 overflow-y-auto px-6 py-5">
      <h1 className="w-expanded text-[36px] font-[650] leading-[1.1]">Fleet health</h1>
      {summary && (
        <dl className="mt-4 grid max-w-[900px] grid-cols-4 gap-6">
          <Stat k="Homes watched" v={num(summary.homes)} />
          <Stat k="People" v={num(summary.residents)} />
          <Stat k="Open incidents" v={num(summary.openIncidents)} />
          <Stat k="Monthly subscriptions" v={`${num(mrr)} credits`} />
        </dl>
      )}

      <section className="mt-8">
        <h2 className="text-[18px] font-[650]">Homes needing attention, by settlement</h2>
        <div className="mt-3 h-56 max-w-[900px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} margin={{ left: -16, right: 8 }}>
              <CartesianGrid stroke="var(--color-hairline)" strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "var(--color-mist)", fontSize: 12 }} stroke="var(--color-hairline)" />
              <YAxis allowDecimals={false} tick={{ fill: "var(--color-mist)", fontSize: 12 }} stroke="var(--color-hairline)" />
              <Tooltip cursor={{ fill: "rgba(220,239,245,.05)" }} contentStyle={{ background: "#172742", border: "1px solid #2C4366", borderRadius: 4, color: "#DCEFF5" }} />
              <Bar dataKey="ADVISORY" name="Advisory" stackId="a" fill={SEV_COLOR.ADVISORY} isAnimationActive={false} />
              <Bar dataKey="WARNING" name="Warning" stackId="a" fill={SEV_COLOR.WARNING} isAnimationActive={false} />
              <Bar dataKey="CRITICAL" name="Critical or worse" stackId="a" fill={SEV_COLOR.CRITICAL} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <table className="mt-8 w-full max-w-[1100px]">
        <thead className="text-left text-mist">
          <tr className="border-b border-hairline">
            <th className="py-2 pr-4 font-normal">Dome</th>
            <th className="py-2 pr-4 text-right font-normal">Homes</th>
            <th className="py-2 pr-4 text-right font-normal">People</th>
            <th className="py-2 pr-4 font-normal">Status</th>
            <th className="py-2 pr-4 text-right font-normal">Repairs booked</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.d.id} className="border-b border-hairline hover:bg-dusk">
              <td className="py-2 pr-4">
                <Link to={`/ops/map/${r.s.code}/${r.d.code}`} className="font-[560] hover:underline underline-offset-4">
                  {r.d.name}
                </Link>{" "}
                <span className="text-mist">{r.s.name}</span>
              </td>
              <td className="py-2 pr-4 text-right tabular">{r.homes}</td>
              <td className="py-2 pr-4 text-right tabular">{r.people}</td>
              <td className="py-2 pr-4">
                <span className="flex flex-wrap gap-3">
                  {LOUD.filter((s) => r.counts[s] > 0).map((s) => (
                    <span key={s} className="inline-flex items-center gap-1 tabular">
                      <StatusGlyph severity={s} size={12} />
                      {r.counts[s]} {SEVERITY_PLURAL[s][r.counts[s] === 1 ? 0 : 1]}
                    </span>
                  ))}
                  {r.offline > 0 && (
                    <span className="inline-flex items-center gap-1 tabular">
                      <StatusGlyph severity="NOMINAL" link="OFFLINE" size={12} />
                      {r.offline} offline
                    </span>
                  )}
                  {LOUD.every((s) => r.counts[s] === 0) && r.offline === 0 && <span className="text-mist">All normal</span>}
                </span>
              </td>
              <td className="py-2 pr-4 text-right tabular">{r.due}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-mist">{k}</dt>
      <dd className="w-expanded tabular text-[24px] font-[650]">{v}</dd>
    </div>
  );
}
