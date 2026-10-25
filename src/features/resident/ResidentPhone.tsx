import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Bell, CreditCard, Home as HomeIcon, LayoutGrid, Lock, Users, type LucideIcon } from "lucide-react";
import type { HomeDetail, Incident, PlaybookRun, Dispatch, TelemetrySnapshot } from "@/api/contracts";
import { sevRank } from "@/api/contracts";
import { useHome, useHomeLive, useHomeStatus, usePlaybooks, useSubscriptions } from "@/hooks/data";
import { useDirectory } from "@/hooks/useDirectory";
import { useIncidentStore } from "@/stores/incidentStore";
import { useFleetStore } from "@/stores/fleetStore";
import { formatMarsHours, formatSol, lmstAt, marsTime } from "@/lib/marsTime";
import { fillTemplate, firstName, num, roomPhrase } from "@/lib/format";
import { StatusGlyph } from "@/components/hg/status";
import { Switch } from "@/components/ui/switch";
import { Loading } from "@/components/hg/Loading";
import { FloorPlan } from "@/features/twin/FloorPlan";
import { sortIncidents } from "@/features/incidents/IncidentColumn";
import { SkyBand } from "./SkyBand";
import { cn } from "@/lib/utils";

export type ResidentTab = "home" | "rooms" | "alerts" | "family" | "plan" | "privacy";
const TABS: { id: ResidentTab; label: string; icon: LucideIcon }[] = [
  { id: "home", label: "Home", icon: HomeIcon },
  { id: "rooms", label: "Rooms", icon: LayoutGrid },
  { id: "alerts", label: "Alerts", icon: Bell },
  { id: "family", label: "Family", icon: Users },
  { id: "plan", label: "Plan", icon: CreditCard },
  { id: "privacy", label: "Privacy", icon: Lock },
];

/** The family's phone. Light, calm, 18 px type; turns into step-by-step guidance in an emergency. */
export function ResidentPhone({ homeCode, viewerName, tab, onTab }: { homeCode: string; viewerName: string; tab: ResidentTab; onTab: (t: ResidentTab) => void }) {
  const { data: home } = useHome(homeCode);
  const { latest } = useHomeLive(home?.id);
  const { data: dir } = useDirectory();
  const where = dir?.homeByCode.get(homeCode);
  const now = useFleetStore((s) => s.simTimeMs);
  const incidents = useIncidentStore((s) => s.incidents);
  const runs = useIncidentStore((s) => s.runs);
  const dispatches = useIncidentStore((s) => s.dispatches);
  const open = useMemo(() => Object.values(incidents).filter((i) => i.homeId === home?.id && i.status !== "RESOLVED").sort(sortIncidents), [incidents, home?.id]);
  const lead = open[0];
  const urgent = lead && (sevRank(lead.severity) >= sevRank("CRITICAL") || runs[lead.id]?.status === "RUNNING") && lead.type !== "HOME_OFFLINE";

  if (!home || !where) return <Loading label="Opening your home" className="theme-resident bg-res-ground text-res-ink" />;
  const lmst = now !== null ? lmstAt(now, where.settlement.lon) : 12;

  return (
    <div className="theme-resident flex h-full min-h-0 flex-col bg-res-ground text-[18px] leading-[1.5] text-res-ink">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "home" &&
          (urgent ? (
            <Emergency home={home} live={latest} incident={lead} run={runs[lead.id]} dispatch={dispatches[lead.id]} viewerName={viewerName} />
          ) : (
            <HomeScreen home={home} live={latest} lmst={lmst} viewerName={viewerName} open={open} settlementName={where.settlement.name} nowMs={now} />
          ))}
        {tab === "rooms" && <RoomsScreen home={home} live={latest} />}
        {tab === "alerts" && <AlertsScreen homeId={home.id} />}
        {tab === "family" && <FamilyScreen home={home} live={latest} />}
        {tab === "plan" && <PlanScreen homeId={home.id} />}
        {tab === "privacy" && <PrivacyScreen />}
      </div>
      <nav className="grid shrink-0 grid-cols-6 border-t border-[#D3DEE4] bg-res-surface" aria-label="Resident app">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onTab(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={cn("flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px]", tab === t.id ? "text-res-ink" : "text-res-muted")}
          >
            <t.icon className="size-5" strokeWidth={tab === t.id ? 2.4 : 1.8} />
            {t.label}
            {t.id === "home" && urgent && <span className="sr-only">, emergency</span>}
          </button>
        ))}
      </nav>
    </div>
  );
}

function greeting(lmst: number) {
  if (lmst < 5 || lmst >= 21) return "Good night";
  if (lmst < 12) return "Good morning";
  if (lmst < 17) return "Good afternoon";
  return "Good evening";
}

function airWords(live: TelemetrySnapshot | undefined) {
  if (!live) return "Checking";
  const rooms = live.rooms.filter((r) => r.pressureKPa > 50);
  const co2 = Math.max(...rooms.map((r) => r.co2Ppm));
  const o2 = Math.min(...rooms.map((r) => r.ppO2KPa));
  if (o2 < 19.5) return "Oxygen is low";
  if (co2 > 2500) return "Stuffy, the air needs clearing";
  if (co2 > 1000) return "Fine, a little stuffy";
  return "Fresh";
}

function HomeScreen({
  home,
  live,
  lmst,
  viewerName,
  open,
  settlementName,
  nowMs,
}: {
  home: HomeDetail;
  live: TelemetrySnapshot | undefined;
  lmst: number;
  viewerName: string;
  open: Incident[];
  settlementName: string;
  nowMs: number | null;
}) {
  const status = useHomeStatus(home.id);
  const sev = status?.severity ?? home.severity;
  const issue = open.find((i) => i.type !== "HOME_OFFLINE");
  const roomName = (id: number | null) => {
    const n = home.rooms.find((r) => r.id === id)?.name;
    return n ? roomPhrase(n) : "home";
  };
  return (
    <>
      <SkyBand lmst={lmst}>
        <div className="px-6 pb-14 pt-10" style={{ color: lmst >= 6.5 && lmst < 17.5 ? "#13233A" : "#F4F7F8" }}>
          <p className="text-[15px] opacity-80">
            {settlementName}, {formatMarsHours(lmst)}
            {nowMs !== null && <>, {formatSol(marsTime(new Date(nowMs)).sol)}</>}
          </p>
          <h1 className="mt-1 font-serif text-[36px] italic leading-[1.1]">
            {greeting(lmst)}, {firstName(viewerName)}
          </h1>
        </div>
      </SkyBand>
      <div className="relative -mt-8 space-y-4 px-4 pb-6">
        <section className="rounded-sheet bg-res-surface p-5">
          <div className="flex items-start gap-3">
            <span className="mt-1">
              {sev === "NOMINAL" ? <span className="block size-3.5 rounded-full border-2 border-res-ink" aria-hidden /> : <StatusGlyph severity={sev} size={18} />}
            </span>
            <div>
              <h2 className="text-[21px] font-[650] leading-tight">{issue ? issue.title : "Everything at home is normal"}</h2>
              <p className="mt-1 text-res-muted">
                {issue
                  ? issue.status === "ACKNOWLEDGED"
                    ? "The control room knows and a technician is booked. Nothing for you to do."
                    : "The control room is looking at it now."
                  : "Life checks the air, power and water every second, day and night."}
              </p>
            </div>
          </div>
        </section>
        <section className="rounded-sheet bg-res-surface p-5">
          <h2 className="text-[16px] font-[650] text-res-muted">Your family</h2>
          <ul className="mt-2 divide-y divide-[#E2EAEE]">
            {home.occupants.map((o) => {
              const pos = live?.occupants.find((x) => x.id === o.id);
              return (
                <li key={o.id} className="flex items-center gap-3 py-2.5">
                  <span className="grid size-10 place-items-center rounded-full bg-[#E2EAEE] text-[14px] font-[650]">{o.initials}</span>
                  <span className="flex-1">{firstName(o.name)}</span>
                  <span className="text-res-muted">{pos ? `in ${roomName(pos.roomId)}` : ""}</span>
                </li>
              );
            })}
          </ul>
        </section>
        <section className="rounded-sheet bg-res-surface p-5">
          <dl className="space-y-2">
            <Row k="Air" v={airWords(live)} />
            {live && <Row k="Power" v={`${num(live.power.batteryKWh)} kWh in the battery`} />}
            {live && <Row k="Water" v={`${num(live.water.tankL)} litres in the tank`} />}
          </dl>
        </section>
      </div>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-res-muted">{k}</dt>
      <dd className="text-right font-[560]">{v}</dd>
    </div>
  );
}

/** Each person gets their own instruction, worked out from where they are and where the playbook is. */
function guidance(roomId: number | null, run: PlaybookRun | undefined, homeShelter: string): string {
  if (!run) return "Stay where you are. The control room is checking.";
  const done = (code: string) => run.steps.find((s) => s.code === code)?.status === "DONE";
  const room = run.targetRoomName ?? "that room";
  const inTarget = roomId !== null && roomId === run.targetRoomId;
  if (run.playbookCode === "PB_BREACH") {
    if (!done("SEAL_HATCH")) return inTarget ? `Leave ${room} now and go to the living room.` : "Stay where you are. Keep the hatches open.";
    return inTarget ? "Stay low and stay calm. Help is on the way to you." : `You're safe where you are. ${room} is sealed.`;
  }
  if (run.playbookCode === "PB_FIRE" || run.playbookCode === "PB_RADIATION") return `Go to the ${homeShelter.toLowerCase()} and stay there.`;
  return "Follow the steps below. The control room is with you.";
}

function Emergency({
  home,
  live,
  incident,
  run,
  dispatch,
  viewerName,
}: {
  home: HomeDetail;
  live: TelemetrySnapshot | undefined;
  incident: Incident;
  run: PlaybookRun | undefined;
  dispatch: Dispatch | undefined;
  viewerName: string;
}) {
  const { data: playbooks } = usePlaybooks();
  const pb = run ? playbooks?.find((p) => p.code === run.playbookCode) : undefined;
  const vars = { room: run?.targetRoomName ?? null, eta: dispatch?.etaSeconds ?? null };
  // Newest step with resident words that applies right now. Waiting steps only speak once
  // their moment has come (the crew is on site, the watch is over).
  const speaks = (code: string, status: string) => {
    if (status === "DONE") return true;
    if (status !== "RUNNING") return false;
    if (code === "PATCH") return dispatch?.status === "ON_SITE";
    return code !== "VERIFY";
  };
  const say = (code: string, status: string, text: string) =>
    code === "PATCH" && status === "DONE" ? "The leak is fixed. We're watching the air for five minutes." : fillTemplate(text, vars);
  const message =
    pb && run
      ? [...pb.steps]
          .map((s, i) => ({ s, st: run.steps[i] }))
          .filter((x) => x.s.residentText && speaks(x.s.code, x.st.status))
          .map((x) => say(x.s.code, x.st.status, x.s.residentText!))
          .pop()
      : undefined;
  const shelter = home.rooms.find((r) => r.isShelter)?.name ?? "shelter";
  const viewer = home.occupants.find((o) => o.name === viewerName);
  return (
    <div>
      <div className="relative overflow-hidden px-6 pb-6 pt-10 text-white" style={{ background: incident.severity === "EMERGENCY" ? "#B0103D" : incident.severity === "CRITICAL" ? "#C2361D" : "#13233A" }}>
        <p className="flex items-center gap-2 text-[15px] font-[560]">
          <StatusGlyph severity={incident.severity} size={16} />{" "}
          {incident.severity === "EMERGENCY" ? "Emergency at home" : incident.severity === "CRITICAL" ? "Act now" : "Being handled"}
        </p>
        <h1 className="mt-2 text-[30px] font-[650] leading-[1.15]">{message ?? incident.title}</h1>
        <p className="mt-2 text-[16px] opacity-90">The control room is handling this with you.</p>
      </div>
      <div className="space-y-4 px-4 py-4">
        <section className="rounded-sheet bg-res-surface p-5">
          <h2 className="text-[16px] font-[650] text-res-muted">What each of you should do</h2>
          <ul className="mt-2 divide-y divide-[#E2EAEE]">
            {home.occupants.map((o) => {
              const pos = live?.occupants.find((x) => x.id === o.id);
              const text = guidance(pos?.roomId ?? null, run, shelter);
              const urgentPerson = pos?.roomId != null && pos.roomId === run?.targetRoomId && run?.steps.find((s) => s.code === "SEAL_HATCH")?.status !== "DONE";
              return (
                <li key={o.id} className="flex gap-3 py-3">
                  <span className={cn("grid size-10 shrink-0 place-items-center rounded-full text-[14px] font-[650]", urgentPerson ? "bg-critical text-white" : "bg-[#E2EAEE]")}>{o.initials}</span>
                  <div>
                    <div className="font-[650]">
                      {firstName(o.name)}
                      {viewer?.id === o.id && <span className="font-normal text-res-muted"> (you)</span>}
                    </div>
                    <div className={urgentPerson ? "font-[560] text-[#B0103D]" : ""}>{text}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
        {live && (
          <section className="rounded-sheet bg-res-surface p-3">
            <div className="h-48 rounded-[12px] bg-[#13233A] p-1">
              <FloorPlan home={home} live={live} predictions={[]} compact />
            </div>
          </section>
        )}
        {dispatch && dispatch.status !== "DONE" && (
          <section className="rounded-sheet bg-res-surface p-5">
            <h2 className="text-[21px] font-[650]">{dispatch.status === "ON_SITE" ? "The repair crew is fixing the leak" : `Help arrives in about ${Math.max(1, Math.round(dispatch.etaSeconds / 60))} minutes`}</h2>
            <p className="mt-1 text-res-muted">
              {dispatch.crewNames.join(" and ")} in rover {dispatch.roverCode}.
            </p>
          </section>
        )}
        <button
          type="button"
          onClick={() => toast("Calling the control room", { description: "Lina Haddad is on the line." })}
          className="min-h-[56px] w-full rounded-sheet bg-res-ink px-5 text-[18px] font-[650] text-white"
        >
          Talk to the control room
        </button>
      </div>
    </div>
  );
}

function RoomsScreen({ home, live }: { home: HomeDetail; live: TelemetrySnapshot | undefined }) {
  return (
    <div className="px-4 pb-6 pt-10">
      <h1 className="px-2 text-[24px] font-[650]">Rooms</h1>
      <ul className="mt-3 divide-y divide-[#E2EAEE] rounded-sheet bg-res-surface px-5">
        {home.rooms
          .filter((r) => r.type !== "CORRIDOR")
          .map((r) => {
            const rd = live?.rooms.find((x) => x.roomId === r.id);
            const word = !rd ? "" : rd.ppO2KPa < 19.5 ? "Oxygen low" : rd.co2Ppm > 1500 ? "Stuffy" : "Fresh air";
            return (
              <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                <span className="flex items-center gap-2">
                  {rd && rd.severity !== "NOMINAL" && <StatusGlyph severity={rd.severity} size={16} />}
                  {r.name}
                </span>
                <span className="text-right text-res-muted tabular">
                  {word}
                  {rd && <>, {rd.tempC.toFixed(0)} °C</>}
                </span>
              </li>
            );
          })}
      </ul>
    </div>
  );
}

function AlertsScreen({ homeId }: { homeId: number }) {
  const incidents = useIncidentStore((s) => s.incidents);
  const list = Object.values(incidents)
    .filter((i) => i.homeId === homeId)
    .sort((a, b) => b.id - a.id);
  return (
    <div className="px-4 pb-6 pt-10">
      <h1 className="px-2 text-[24px] font-[650]">Alerts</h1>
      {list.length === 0 ? (
        <p className="mt-3 rounded-sheet bg-res-surface p-5 text-res-muted">Nothing has happened at home. When something does, you'll see it here with what was done about it.</p>
      ) : (
        <ul className="mt-3 divide-y divide-[#E2EAEE] rounded-sheet bg-res-surface px-5">
          {list.map((i) => (
            <li key={i.id} className="py-3">
              <div className="flex items-center gap-2 font-[560]">
                <StatusGlyph severity={i.severity} size={15} />
                {i.title}
              </div>
              <div className="text-res-muted">{i.status === "RESOLVED" ? "Resolved" : "Being handled"}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FamilyScreen({ home, live }: { home: HomeDetail; live: TelemetrySnapshot | undefined }) {
  const [notify, setNotify] = useState<Record<number, boolean>>(() => Object.fromEntries(home.occupants.map((o) => [o.id, o.age >= 12])));
  return (
    <div className="px-4 pb-6 pt-10">
      <h1 className="px-2 text-[24px] font-[650]">Family</h1>
      <ul className="mt-3 divide-y divide-[#E2EAEE] rounded-sheet bg-res-surface px-5">
        {home.occupants.map((o) => {
          const pos = live?.occupants.find((x) => x.id === o.id);
          const room = home.rooms.find((r) => r.id === pos?.roomId)?.name;
          return (
            <li key={o.id} className="flex items-center gap-3 py-3">
              <span className="grid size-10 place-items-center rounded-full bg-[#E2EAEE] text-[14px] font-[650]">{o.initials}</span>
              <span className="flex-1">
                <span className="block font-[560]">{o.name}</span>
                <span className="block text-[15px] text-res-muted">
                  {o.isHomeowner ? "Homeowner" : `Age ${o.age}`}
                  {room && `, in ${roomPhrase(room)}`}
                </span>
              </span>
              <label className="flex items-center gap-2 text-[14px] text-res-muted">
                Alerts
                <Switch checked={notify[o.id]} onCheckedChange={(v) => setNotify((n) => ({ ...n, [o.id]: v }))} aria-label={`Send alerts to ${firstName(o.name)}`} />
              </label>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 px-2 text-[15px] text-res-muted">In an emergency everyone at home gets instructions, whatever these switches say.</p>
    </div>
  );
}

const PLANS = [
  { tier: "BASIC", price: 49, what: "Air, power and water watched around the clock. Alerts to your phone." },
  { tier: "FAMILY", price: 89, what: "Everything in Basic, plus per-person guidance, playbooks run for you, and repairs booked before parts fail." },
  { tier: "PREMIUM", price: 149, what: "Everything in Family, plus a priority repair crew, emergency oxygen refills, and a yearly home check." },
];

function PlanScreen({ homeId }: { homeId: number }) {
  const { data: subs } = useSubscriptions();
  const mine = subs?.find((s) => s.homeId === homeId);
  return (
    <div className="px-4 pb-6 pt-10">
      <h1 className="px-2 text-[24px] font-[650]">Your plan</h1>
      <ul className="mt-3 space-y-3">
        {PLANS.map((p) => {
          const current = mine?.plan === p.tier;
          return (
            <li key={p.tier} className={cn("rounded-sheet bg-res-surface p-5", current && "outline-2 outline-res-ink")}>
              <div className="flex items-baseline justify-between">
                <span className="text-[21px] font-[650]">{p.tier.charAt(0) + p.tier.slice(1).toLowerCase()}</span>
                <span className="tabular">
                  {p.price} credits <span className="text-res-muted">a month</span>
                </span>
              </div>
              <p className="mt-1 text-res-muted">{p.what}</p>
              {current && <p className="mt-2 font-[560]">Your current plan</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PrivacyScreen() {
  const [insurer, setInsurer] = useState(false);
  const [responders, setResponders] = useState(true);
  const [history, setHistory] = useState(true);
  const items = [
    { label: "Share my home's safety record with my insurer", hint: "Off unless you turn it on. You can stop sharing at any time.", v: insurer, set: setInsurer },
    { label: "Let rescue teams see my floor plan in an emergency", hint: "Only while an emergency is open.", v: responders, set: setResponders },
    { label: "Keep detailed readings for 30 sols", hint: "Helps explain what happened after an incident.", v: history, set: setHistory },
  ];
  return (
    <div className="px-4 pb-6 pt-10">
      <h1 className="px-2 text-[24px] font-[650]">Privacy</h1>
      <ul className="mt-3 divide-y divide-[#E2EAEE] rounded-sheet bg-res-surface px-5">
        {items.map((it) => (
          <li key={it.label} className="flex items-start gap-4 py-4">
            <div className="flex-1">
              <div className="font-[560]">{it.label}</div>
              <div className="text-[15px] text-res-muted">{it.hint}</div>
            </div>
            <Switch
              checked={it.v}
              onCheckedChange={(v) => {
                it.set(v);
                toast(v ? "Turned on" : "Turned off", { description: it.label });
              }}
              aria-label={it.label}
            />
          </li>
        ))}
      </ul>
      <p className="mt-3 px-2 text-[15px] text-res-muted">Life never sells your data. Readings stay on Mars.</p>
    </div>
  );
}

