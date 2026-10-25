import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { api } from "@/api";
import type { IncidentEvent } from "@/api/contracts";
import { useHome, useHomeLive, useIncidentBundle } from "@/hooks/data";
import { useDirectory } from "@/hooks/useDirectory";
import { useIncidentStore } from "@/stores/incidentStore";
import { useUiStore } from "@/stores/uiStore";
import { Loading, ErrorLine } from "@/components/hg/Loading";
import { SeverityLabel } from "@/components/hg/status";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { STATUS_WORD } from "@/lib/format";
import { localClock, localStamp } from "@/lib/localTime";
import { PlaybookPanel } from "./PlaybookPanel";

const EVENT_WORD: Record<IncidentEvent["kind"], string> = {
  DETECTED: "Detected",
  ESCALATED: "Escalated",
  ACKNOWLEDGED: "Acknowledged",
  STEP_STARTED: "Started",
  STEP_DONE: "Done",
  NOTE: "Note",
  DISPATCHED: "Dispatched",
  AUTOPILOT: "Autopilot",
  RESOLVED: "Resolved",
};

export default function IncidentDetailPage() {
  const { incidentCode = "" } = useParams();
  const code = incidentCode.toUpperCase();
  const { data: bundle, error } = useIncidentBundle(code);
  const live = useIncidentStore((s) => (bundle ? s.incidents[bundle.incident.id] : undefined));
  const liveEvents = useIncidentStore((s) => (bundle ? s.events[bundle.incident.id] : undefined));
  const run = useIncidentStore((s) => (bundle ? s.runs[bundle.incident.id] : undefined)) ?? bundle?.run;
  const dispatch = useIncidentStore((s) => (bundle ? s.dispatches[bundle.incident.id] : undefined)) ?? bundle?.dispatch;
  const { data: dir } = useDirectory();
  const where = bundle?.incident.homeId != null ? dir?.homeById.get(bundle.incident.homeId) : undefined;
  const { data: home } = useHome(where?.code);
  const { latest } = useHomeLive(home?.id);
  const setFocus = useUiStore((s) => s.setFocusSettlement);
  useEffect(() => {
    if (where) setFocus(where.settlement.code);
  }, [where, setFocus]);

  const incident = live ?? bundle?.incident;
  const events = useMemo(() => {
    const m = new Map<number, IncidentEvent>();
    for (const e of [...(bundle?.events ?? []), ...(liveEvents ?? [])]) m.set(e.id, e);
    return [...m.values()].sort((a, b) => a.ts.localeCompare(b.ts) || a.id - b.id);
  }, [bundle?.events, liveEvents]);

  if (error) return <ErrorLine error={error} />;
  if (!bundle || !incident) return <Loading label="Opening the incident" />;
  const lon = where?.settlement.lon ?? 0;

  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="grid min-h-full grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 px-6 py-5">
          <nav className="text-mist">
            <Link to="/ops/incidents" className="hover:text-glass hover:underline underline-offset-4">
              Incidents
            </Link>{" "}
            / <span className="w-condensed tabular">{incident.code}</span>
          </nav>
          <h1 className="w-expanded mt-1 text-[36px] font-[650] leading-[1.1]">{incident.title}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-mist">
            <SeverityLabel severity={incident.severity} />
            <span>{STATUS_WORD[incident.status]}</span>
            <span>Started {localStamp(incident.startedAt, lon)}</span>
            {where && (
              <Link to={`/ops/homes/${where.code}`} className="text-glass underline underline-offset-4">
                {where.householdName}, <span className="w-condensed tabular">{where.code}</span>
              </Link>
            )}
          </p>

          {home && <BlackBox roomNames={new Map(home.rooms.map((r) => [r.id, r.name]))} homeId={home.id} startedAt={incident.startedAt} resolvedAt={incident.resolvedAt} events={events} lon={lon} liveTs={latest?.ts} />}

          <h2 className="mt-8 text-[18px] font-[650]">What happened, minute by minute</h2>
          <ol className="mt-3 border-l border-hairline">
            {events.map((e) => (
              <li key={e.id} className="relative pb-3 pl-5">
                <span className="absolute -left-[4.5px] top-2 size-2 rounded-full" style={{ background: e.actor === "Autopilot" ? "var(--color-warning)" : e.kind === "RESOLVED" ? "var(--color-glass)" : "var(--color-mist)" }} aria-hidden />
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="tabular text-mist">{localClock(e.ts, lon)}</span>
                  <span className="font-[560]">{EVENT_WORD[e.kind]}</span>
                  <span className="text-mist">{e.actor}</span>
                </div>
                <p>{e.text}</p>
              </li>
            ))}
          </ol>
          <NoteForm incidentId={incident.id} />
        </div>
        <aside className="space-y-6 border-l border-hairline bg-dusk/40 px-5 py-5">
          <PlaybookPanel incident={incident} run={run} dispatch={dispatch} home={home} live={latest} showIncidentLink={false} />
          {bundle.alerts.length > 0 && (
            <div className="border-t border-hairline pt-4">
              <h2 className="font-[650]">Alerts in this incident</h2>
              <ul className="mt-2 space-y-2">
                {bundle.alerts.map((a) => (
                  <li key={a.id}>
                    <SeverityLabel severity={a.severity} short /> <span className="font-[560]">{a.title}</span>
                    <p className="text-mist">{a.message}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

/** The black box: oxygen and pressure per room over the incident, with every event marked. */
function BlackBox({
  homeId,
  startedAt,
  resolvedAt,
  events,
  lon,
  liveTs,
  roomNames,
}: {
  roomNames: Map<number, string>;
  homeId: number;
  startedAt: string;
  resolvedAt: string | null;
  events: IncidentEvent[];
  lon: number;
  liveTs: string | undefined;
}) {
  const from = new Date(Date.parse(startedAt) - 5 * 60_000).toISOString();
  const to = resolvedAt ? new Date(Date.parse(resolvedAt) + 2 * 60_000).toISOString() : new Date(Date.parse(liveTs ?? startedAt) + 60_000).toISOString();
  const bucket = liveTs ? Math.floor(Date.parse(liveTs) / 15000) : 0; // refetch every ~15 s of sim time while live
  const { data: history } = useQuery({
    queryKey: ["history", homeId, startedAt, resolvedAt ?? bucket],
    queryFn: () => api.getTelemetryHistory(homeId, from, to),
    placeholderData: (prev) => prev,
  });

  const rows = useMemo(() => {
    if (!history?.length) return [];
    const step = Math.max(1, Math.floor(history.length / 240));
    return history
      .filter((_, i) => i % step === 0)
      .map((s) => {
        const row: Record<string, number> = { t: Date.parse(s.ts) };
        for (const r of s.rooms) row[`o2_${r.roomId}`] = +r.ppO2KPa.toFixed(2);
        return row;
      });
  }, [history]);
  const roomIds = history?.[0]?.rooms.map((r) => r.roomId) ?? [];
  // Rooms that diverged from the rest get their own line; the rest share one quiet line.
  const minBy = new Map(roomIds.map((id) => [id, Math.min(...rows.map((r) => r[`o2_${id}`] ?? 99))]));
  const lowest = [...minBy.entries()].sort((a, b) => a[1] - b[1]);
  const highlight = lowest.slice(0, 2).map(([id]) => id);

  return (
    <section className="mt-6" aria-label="Black box">
      <h2 className="text-[18px] font-[650]">Black box</h2>
      <p className="text-mist">Oxygen in every room, recorded by the home during the incident. Events are marked on the timeline.</p>
      {rows.length < 3 ? (
        <Loading label="Reading the black box" className="h-56" />
      ) : (
        <div className="mt-3 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="var(--color-hairline)" strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(t: number) => localClock(new Date(t).toISOString(), lon)} tick={{ fill: "var(--color-mist)", fontSize: 11 }} stroke="var(--color-hairline)" />
              <YAxis domain={[(dataMin: number) => Math.min(15.5, Math.floor(dataMin)), 21.6]} tick={{ fill: "var(--color-mist)", fontSize: 11 }} stroke="var(--color-hairline)" tickFormatter={(v: number) => v.toFixed(0)} width={40} />
              <ChartTooltip
                contentStyle={{ background: "#172742", border: "1px solid #2C4366", borderRadius: 4, color: "#DCEFF5" }}
                labelFormatter={(t) => localClock(new Date(Number(t)).toISOString(), lon)}
                formatter={(v, name) => [`${v} kPa`, roomNames.get(Number(String(name).slice(3))) ?? "Room"]}
              />
              <ReferenceLine y={16} stroke="var(--color-critical)" strokeDasharray="4 3" />
              {events
                .filter((e) => e.kind !== "NOTE")
                .map((e) => (
                  <ReferenceLine key={e.id} x={Date.parse(e.ts)} stroke={e.actor === "Autopilot" ? "var(--color-warning)" : "var(--color-mist)"} strokeOpacity={0.5} />
                ))}
              {roomIds.map((id) => (
                <Line
                  key={id}
                  dataKey={`o2_${id}`}
                  dot={false}
                  isAnimationActive={false}
                  stroke={highlight.includes(id) ? (id === highlight[0] ? "var(--color-critical)" : "var(--color-glass)") : "var(--color-mist)"}
                  strokeOpacity={highlight.includes(id) ? 1 : 0.35}
                  strokeWidth={highlight.includes(id) ? 1.8 : 1}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function NoteForm({ incidentId }: { incidentId: number }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mt-4 max-w-[60ch] space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        setBusy(true);
        try {
          await api.addIncidentNote(incidentId, text);
          setText("");
          toast("Note added");
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label htmlFor="note" className="block font-[560]">
        Add a note for the handover
      </label>
      <Textarea id="note" value={text} onChange={(e) => setText(e.target.value)} placeholder="What you saw, what you did, what the next shift should know" rows={3} />
      <Button type="submit" variant="outline" disabled={busy || !text.trim()}>
        Add note
      </Button>
    </form>
  );
}
