import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { PlanTier } from "@/api/contracts";
import { StaffShell } from "@/app/layouts/StaffShell";
import { useSubscriptions } from "@/hooks/data";
import { useDirectory } from "@/hooks/useDirectory";
import { Loading } from "@/components/hg/Loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { num } from "@/lib/format";

const PRICE: Record<PlanTier, number> = { BASIC: 49, FAMILY: 89, PREMIUM: 149, SETTLEMENT: 0 };
const PLAN_WORD: Record<PlanTier, string> = { BASIC: "Basic", FAMILY: "Family", PREMIUM: "Premium", SETTLEMENT: "Settlement" };

/** Subscriptions and bringing a new home online. Onboarding is client-side until the backend has an endpoint. */
export default function AdminPage() {
  const { data: subs } = useSubscriptions();
  const { data: dir } = useDirectory();
  const [pending, setPending] = useState<{ code: string; household: string; plan: PlanTier }[]>([]);

  const byPlan = useMemo(() => {
    const m = new Map<PlanTier, number>();
    for (const s of subs ?? []) m.set(s.plan, (m.get(s.plan) ?? 0) + 1);
    return m;
  }, [subs]);
  const mrr = (subs ?? []).filter((s) => s.status !== "PAST_DUE").reduce((a, s) => a + s.monthlyPrice, 0);
  const trial = subs?.filter((s) => s.status === "TRIAL") ?? [];
  const pastDue = subs?.filter((s) => s.status === "PAST_DUE") ?? [];

  return (
    <StaffShell title="Admin">
      {!subs || !dir ? (
        <Loading label="Loading subscriptions" />
      ) : (
        <div className="mx-auto grid max-w-[1200px] gap-10 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div>
            <h1 className="w-expanded text-[36px] font-[650] leading-[1.1]">Subscriptions</h1>
            <dl className="mt-5 grid grid-cols-3 gap-6">
              <Stat k="Homes subscribed" v={num(subs.length)} />
              <Stat k="Monthly, in credits" v={num(mrr)} />
              <Stat k="On trial" v={num(trial.length)} />
            </dl>
            <table className="mt-6 w-full">
              <thead className="text-left text-mist">
                <tr className="border-b border-hairline">
                  <th className="py-2 font-normal">Plan</th>
                  <th className="py-2 text-right font-normal">Homes</th>
                  <th className="py-2 text-right font-normal">Price a month</th>
                  <th className="py-2 text-right font-normal">Credits a month</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {(["BASIC", "FAMILY", "PREMIUM"] as PlanTier[]).map((p) => (
                  <tr key={p} className="border-b border-hairline">
                    <td className="py-2 font-sans">{PLAN_WORD[p]}</td>
                    <td className="py-2 text-right">{num(byPlan.get(p) ?? 0)}</td>
                    <td className="py-2 text-right">{PRICE[p]}</td>
                    <td className="py-2 text-right">{num((byPlan.get(p) ?? 0) * PRICE[p])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pastDue.length > 0 && (
              <>
                <h2 className="mt-8 text-[18px] font-[650]">Payment overdue</h2>
                <p className="text-mist">Monitoring never stops for overdue homes. These families get a reminder, not a cut-off.</p>
                <ul className="mt-2 divide-y divide-hairline border-y border-hairline">
                  {pastDue.map((s) => {
                    const h = dir.homeById.get(s.homeId);
                    return (
                      <li key={s.id} className="flex justify-between py-2">
                        <span>
                          {h?.householdName} <span className="w-condensed tabular text-mist">{h?.code}</span>
                        </span>
                        <span className="text-mist">{PLAN_WORD[s.plan]}</span>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
          <Onboarding
            domes={dir.domes.map((d) => ({ id: d.id, label: `${d.name}, ${dir.settlements.find((s) => s.id === d.settlementId)!.name}`, code: `${dir.settlements.find((s) => s.id === d.settlementId)!.code}-${d.code}`, homes: d.homeCount }))}
            onDone={(p) => setPending((x) => [p, ...x])}
            pending={pending}
          />
        </div>
      )}
    </StaffShell>
  );
}

function Onboarding({
  domes,
  onDone,
  pending,
}: {
  domes: { id: number; label: string; code: string; homes: number }[];
  onDone: (p: { code: string; household: string; plan: PlanTier }) => void;
  pending: { code: string; household: string; plan: PlanTier }[];
}) {
  const [household, setHousehold] = useState("");
  const [dome, setDome] = useState(String(domes[0]?.id ?? ""));
  const [template, setTemplate] = useState("FAMILY");
  const [plan, setPlan] = useState<PlanTier>("FAMILY");
  const [people, setPeople] = useState("4");
  const d = domes.find((x) => String(x.id) === dome);
  const code = d ? `${d.code}-${String(d.homes + 1 + pending.filter((p) => p.code.startsWith(d.code)).length).padStart(3, "0")}` : "";
  const error = household.trim().length === 0 ? "Enter the household's family name." : null;
  return (
    <section className="rounded-instrument border border-hairline p-5">
      <h2 className="text-[21px] font-[650]">Bring a new home online</h2>
      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (error) return;
          onDone({ code, household: `${household.trim()} family`, plan });
          toast(`${code} is being set up`, { description: "Sensors connect within a sol. The home appears on the map once it reports." });
          setHousehold("");
        }}
      >
        <label className="block">
          <span className="font-[560]">Family name</span>
          <Input className="mt-1" value={household} onChange={(e) => setHousehold(e.target.value)} placeholder="Okafor" aria-invalid={household.length > 0 && !!error} />
        </label>
        <label className="block">
          <span className="font-[560]">Dome</span>
          <Select value={dome} onValueChange={setDome}>
            <SelectTrigger className="mt-1 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {domes.map((x) => (
                <SelectItem key={x.id} value={String(x.id)}>
                  {x.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="font-[560]">Home</span>
            <Select value={template} onValueChange={setTemplate}>
              <SelectTrigger className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FAMILY">Family home</SelectItem>
                <SelectItem value="POD">Pod</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="block">
            <span className="font-[560]">People</span>
            <Input className="mt-1" type="number" min={1} max={template === "POD" ? 2 : 6} value={people} onChange={(e) => setPeople(e.target.value)} />
          </label>
        </div>
        <label className="block">
          <span className="font-[560]">Plan</span>
          <Select value={plan} onValueChange={(v) => setPlan(v as PlanTier)}>
            <SelectTrigger className="mt-1 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["BASIC", "FAMILY", "PREMIUM"] as PlanTier[]).map((p) => (
                <SelectItem key={p} value={p}>
                  {PLAN_WORD[p]}, {PRICE[p]} credits a month
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <p className="text-mist">
          It will be <span className="w-condensed tabular text-glass">{code}</span>.
        </p>
        <Button type="submit" disabled={!!error}>
          Set up {code}
        </Button>
      </form>
      {pending.length > 0 && (
        <ul className="mt-5 divide-y divide-hairline border-t border-hairline">
          {pending.map((p) => (
            <li key={p.code} className="flex justify-between py-2">
              <span>
                {p.household} <span className="w-condensed tabular text-mist">{p.code}</span>
              </span>
              <span className="text-mist">Setting up</span>
            </li>
          ))}
        </ul>
      )}
    </section>
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
