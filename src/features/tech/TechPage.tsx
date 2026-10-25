import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { WorkOrder } from "@/api/contracts";
import { StaffShell } from "@/app/layouts/StaffShell";
import { useWorkOrders } from "@/hooks/data";
import { useDirectory } from "@/hooks/useDirectory";
import { Loading } from "@/components/hg/Loading";
import { Button } from "@/components/ui/button";
import { Sparkline } from "@/components/hg/Sparkline";
import { cn } from "@/lib/utils";

const REASON: Record<WorkOrder["reason"], string> = { PREDICTIVE: "Predicted", INCIDENT: "After an incident", ROUTINE: "Routine" };
const STATUS: Record<WorkOrder["status"], string> = { NEW: "New", SCHEDULED: "Scheduled", IN_PROGRESS: "In progress", DONE: "Done" };

/** Kenji's work orders: repairs booked from health trends before the part fails. */
export default function TechPage() {
  const { data: orders, isLoading } = useWorkOrders();
  const { data: dir } = useDirectory();
  const [selected, setSelected] = useState<number | null>(null);
  // Status changes are local: the contract has no work-order update endpoint yet (see DECISIONS.md).
  const [local, setLocal] = useState<Record<number, WorkOrder["status"]>>({});
  const list = useMemo(() => (orders ?? []).map((o) => ({ ...o, status: local[o.id] ?? o.status })), [orders, local]);
  const sel = list.find((o) => o.id === selected) ?? list[0];

  return (
    <StaffShell title="Work orders">
      {isLoading || !orders ? (
        <Loading label="Loading work orders" />
      ) : (
        <div className="grid min-h-full grid-cols-[minmax(0,1fr)_420px]">
          <div className="px-6 py-5">
            <h1 className="w-expanded text-[36px] font-[650] leading-[1.1]">Repairs before they're emergencies</h1>
            <p className="mt-2 max-w-[64ch] text-mist">Each part's health is tracked every sol. When the trend says it will drop below 70%, a repair is booked here first.</p>
            <table className="mt-5 w-full">
              <thead className="text-left text-mist">
                <tr className="border-b border-hairline">
                  <th className="py-2 pr-3 font-normal">Due</th>
                  <th className="py-2 pr-3 font-normal">Job</th>
                  <th className="py-2 pr-3 font-normal">Home</th>
                  <th className="py-2 pr-3 font-normal">Why</th>
                  <th className="py-2 pr-3 font-normal">Health trend</th>
                  <th className="py-2 font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {list.map((o) => {
                  const home = dir?.homeById.get(o.homeId);
                  return (
                    <tr
                      key={o.id}
                      onClick={() => setSelected(o.id)}
                      className={cn("cursor-pointer border-b border-hairline hover:bg-dusk", sel?.id === o.id && "bg-dusk-high", o.status === "DONE" && "text-mist")}
                    >
                      <td className="py-2 pr-3 tabular">Sol {o.dueSol.toLocaleString("en-US")}</td>
                      <td className="py-2 pr-3">
                        <button type="button" className="text-left font-[560]" onClick={() => setSelected(o.id)}>
                          {o.title}
                        </button>
                      </td>
                      <td className="py-2 pr-3">
                        <span className="w-condensed tabular">{home?.code}</span> <span className="text-mist">{home?.householdName}</span>
                      </td>
                      <td className="py-2 pr-3 text-mist">{REASON[o.reason]}</td>
                      <td className="py-2 pr-3">{o.healthTrend && <Sparkline values={o.healthTrend.map((p) => p.healthPct)} threshold={70} width={90} height={18} />}</td>
                      <td className="py-2">{STATUS[o.status]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {sel && (
            <aside className="border-l border-hairline bg-dusk/40 px-5 py-5">
              <h2 className="text-[21px] font-[650]">{sel.title}</h2>
              <p className="text-mist">
                {dir?.homeById.get(sel.homeId)?.householdName}, <span className="w-condensed tabular">{dir?.homeById.get(sel.homeId)?.code}</span>
              </p>
              {sel.healthTrend && (
                <div className="mt-4 h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={sel.healthTrend} margin={{ left: -18, right: 8, top: 6 }}>
                      <CartesianGrid stroke="var(--color-hairline)" strokeDasharray="2 4" vertical={false} />
                      <XAxis dataKey="sol" tick={{ fill: "var(--color-mist)", fontSize: 11 }} stroke="var(--color-hairline)" tickFormatter={(v: number) => `Sol ${v % 1000}`} />
                      <YAxis domain={[50, 100]} tick={{ fill: "var(--color-mist)", fontSize: 11 }} stroke="var(--color-hairline)" />
                      <ReferenceLine y={70} stroke="var(--color-warning)" strokeDasharray="4 3" label={{ value: "service line", fill: "var(--color-warning)", fontSize: 11, position: "insideBottomLeft" }} />
                      <Line dataKey="healthPct" stroke="var(--color-glass)" dot={false} strokeWidth={1.6} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                <dt className="text-mist">Due</dt>
                <dd className="tabular">Sol {sel.dueSol.toLocaleString("en-US")}</dd>
                <dt className="text-mist">Why</dt>
                <dd>{REASON[sel.reason]}</dd>
                <dt className="text-mist">Assigned to</dt>
                <dd>{sel.assignee ?? "Nobody yet"}</dd>
              </dl>
              <div className="mt-5 flex gap-2">
                {sel.status !== "IN_PROGRESS" && sel.status !== "DONE" && (
                  <Button onClick={() => (setLocal((l) => ({ ...l, [sel.id]: "IN_PROGRESS" })), toast("Work started", { description: sel.title }))}>Start work</Button>
                )}
                {sel.status !== "DONE" && (
                  <Button variant="outline" onClick={() => (setLocal((l) => ({ ...l, [sel.id]: "DONE" })), toast("Marked done", { description: sel.title }))}>
                    Mark done
                  </Button>
                )}
              </div>
            </aside>
          )}
        </div>
      )}
    </StaffShell>
  );
}
