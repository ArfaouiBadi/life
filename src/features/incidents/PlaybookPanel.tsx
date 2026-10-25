import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import { Check, Minus } from "lucide-react";
import { api } from "@/api";
import type { Dispatch, HomeDetail, Incident, PlaybookRun, TelemetrySnapshot } from "@/api/contracts";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SeverityLabel } from "@/components/hg/status";
import { usePlaybooks } from "@/hooks/data";
import { useFleetStore } from "@/stores/fleetStore";
import { STATUS_WORD, ageWords, fillTemplate, firstName } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Incident header, acknowledge/run controls and the playbook as a checked-off sequence. */
export function PlaybookPanel({
  incident,
  run,
  dispatch,
  home,
  live,
  showIncidentLink = true,
}: {
  incident: Incident;
  run: PlaybookRun | null | undefined;
  dispatch: Dispatch | null | undefined;
  home?: HomeDetail;
  live?: TelemetrySnapshot;
  showIncidentLink?: boolean;
}) {
  const { data: playbooks } = usePlaybooks();
  const pb = run ? playbooks?.find((p) => p.code === run.playbookCode) : undefined;
  const now = useFleetStore((s) => s.simTimeMs) ?? Date.now();
  const speed = useFleetStore((s) => s.speed);
  const [guard, setGuard] = useState<{ step: string; names: string[]; room: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const room = run?.targetRoomName ?? null;
  const vars = { room, eta: dispatch?.etaSeconds ?? null };
  const current = run?.steps.findIndex((s) => s.status === "PENDING" || s.status === "RUNNING") ?? -1;

  const act = async (label: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(label);
    try {
      await fn();
      if (done) toast(done);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const runStep = (code: string, doneText: string) => act(code, () => api.executeStep(run!.id, code), fillTemplate(doneText, vars));

  const confirmStep = (code: string, doneText: string) => {
    // The guard: never seal a room with someone in it without saying who.
    if (code.startsWith("SEAL") && run?.targetRoomId != null && home) {
      const inside = (live?.occupants ?? []).filter((o) => o.roomId === run.targetRoomId);
      if (inside.length) {
        const names = inside.map((o) => firstName(home.occupants.find((x) => x.id === o.id)?.name ?? "Someone"));
        setGuard({ step: code, names, room: room ?? "the room" });
        return;
      }
    }
    void runStep(code, doneText);
  };

  const autoIn = run?.status === "PENDING" && run.autoRunAt ? Math.max(0, (Date.parse(run.autoRunAt) - now) / 1000 / speed) : null;

  return (
    <section aria-label="Incident" className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[18px] font-[650] leading-tight">{incident.title}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-mist">
            <SeverityLabel severity={incident.severity} />
            <span>{STATUS_WORD[incident.status]}</span>
            {incident.assignee && <span>{incident.assignee}</span>}
            {showIncidentLink && (
              <Link to={`/ops/incidents/${incident.code}`} className="w-condensed tabular text-glass underline underline-offset-4">
                {incident.code}
              </Link>
            )}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {!incident.acknowledgedAt && incident.status !== "RESOLVED" && (
          <Button variant={run?.status === "PENDING" ? "outline" : "default"} disabled={busy !== null} onClick={() => act("ack", () => api.acknowledgeIncident(incident.id), "Acknowledged")}>
            Acknowledge
          </Button>
        )}
        {run?.status === "PENDING" && pb && (
          <Button disabled={busy !== null} onClick={() => act("run", () => api.startPlaybook(incident.id), `${pb.name} started`)}>
            Run {pb.name.toLowerCase()}
          </Button>
        )}
      </div>
      {autoIn !== null && autoIn > 0 && !incident.acknowledgedAt && (
        <p className="text-mist" role="status">
          Starts automatically in <span className="tabular text-glass">{ageWords(autoIn * 1000)}</span> if nobody responds.
        </p>
      )}

      {pb && run && (
        <ol className="relative space-y-0.5" aria-label={pb.name}>
          {pb.steps.map((def, i) => {
            const st = run.steps[i];
            const isCurrent = i === current && run.status === "RUNNING";
            const title = fillTemplate(def.title, vars);
            return (
              <li key={def.code} className={cn("flex gap-3 rounded-instrument px-2 py-2", isCurrent && "bg-dusk-high")}>
                <StepMark status={st.status} index={i + 1} running={isCurrent && def.mode !== "CONFIRM"} />
                <div className="min-w-0 flex-1">
                  <div className={cn("font-[560]", st.status === "PENDING" && !isCurrent && "text-mist", st.status === "SKIPPED" && "text-mist line-through decoration-hairline")}>{title}</div>
                  <AnimatePresence initial={false}>
                    {st.status === "DONE" && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} transition={{ duration: 0.24, ease: [0.2, 0, 0, 1] }} className="text-mist">
                        {fillTemplate(def.doneText, vars)}
                        {st.actor && st.actor !== "System" && <span>, {st.actor}</span>}
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {isCurrent && def.mode === "CONFIRM" && (
                    <Button className="mt-2" variant="default" disabled={busy !== null} onClick={() => confirmStep(def.code, def.doneText)}>
                      {title}
                    </Button>
                  )}
                  {isCurrent && def.mode !== "CONFIRM" && <div className="text-mist">In progress</div>}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {dispatch && dispatch.status !== "DONE" && (
        <p className="border-l-2 border-glass/40 pl-3">
          <span className="font-[560]">{dispatch.roverCode}</span> with {dispatch.crewNames.join(" and ")}:{" "}
          {dispatch.status === "PREPARING" && <>preparing, arrives in {Math.max(1, Math.round(dispatch.etaSeconds / 60))} min</>}
          {dispatch.status === "EN_ROUTE" && <>on the way, {Math.max(1, Math.round(dispatch.etaSeconds / 60))} min out</>}
          {dispatch.status === "ON_SITE" && <>on site, patching</>}
        </p>
      )}

      <AlertDialog open={guard !== null} onOpenChange={(o) => !o && setGuard(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {guard?.names.join(" and ")} {guard && guard.names.length > 1 ? "are" : "is"} still in {guard?.room}. Seal the hatch anyway?
            </AlertDialogTitle>
            <AlertDialogDescription>Sealing traps anyone inside with the leak. Their air would become unsafe in minutes, not hours.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel autoFocus>Wait for {guard?.names.join(" and ")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-critical text-twilight hover:bg-critical/85"
              onClick={() => {
                const g = guard!;
                setGuard(null);
                const def = pb!.steps.find((s) => s.code === g.step)!;
                void runStep(g.step, def.doneText);
              }}
            >
              Seal anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function StepMark({ status, index, running }: { status: PlaybookRun["steps"][number]["status"]; index: number; running: boolean }) {
  if (status === "DONE")
    return (
      <motion.span initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ duration: 0.12 }} className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-glass text-twilight">
        <Check className="size-3.5" strokeWidth={3} />
      </motion.span>
    );
  if (status === "SKIPPED")
    return (
      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-hairline text-mist">
        <Minus className="size-3" />
      </span>
    );
  return (
    <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border text-[11px] tabular", running ? "border-glass text-glass" : "border-hairline text-mist")}>
      {index}
    </span>
  );
}
