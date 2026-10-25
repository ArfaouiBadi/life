import type { Hatch, Id, IsoInstant, Page, Role, Session } from "../contracts";
import type { HabitatApi, IncidentBundle } from "../HabitatApi";
import { SimEngine } from "@/sim/engine";
import { mulberry32 } from "@/sim/rng";
import { PLAYBOOKS } from "@/sim/playbooks/definitions";
import { PlaybookError, confirmStep, createDispatch, splitZones, startRun } from "@/sim/playbooks/runner";
import { addEvent, isoAt } from "@/sim/detect/incidents";
import { newOutbox } from "@/sim/outbox";
import { heroCode } from "@/sim/world/generateWorld";
import { dispatchDto, domeDto, homeDetail, homeSummary, incidentDto, regionalDto, runDto, settlementDto, fleetSummary } from "@/sim/dto";
import { HttpError } from "../errors";

export const IDENTITIES: { code: string; name: string; role: Role; landing: string; blurb: string }[] = [
  { code: "OPS", name: "Lina Haddad", role: "OPERATOR", landing: "/ops/map", blurb: "Watches every home from the control room." },
  { code: "SUP", name: "Karim Ben Salah", role: "SUPERVISOR", landing: "/ops/map", blurb: "Operator view plus overrides and fleet health." },
  { code: "RES", name: "Amira Trabelsi", role: "HOMEOWNER", landing: "/resident", blurb: "Her family's home in New Jezero, on her phone." },
  { code: "TEC", name: "Nabil Jendoubi", role: "TECHNICIAN", landing: "/tech", blurb: "Repairs booked before parts fail." },
  { code: "ADM", name: "Sarra Kchaou", role: "ADMIN", landing: "/admin", blurb: "Subscriptions and new homes." },
];

/** Thin wrapper over the simulation. Reads get 120–350 ms of latency so loading states are real. */
export class MockApi implements HabitatApi {
  private engine: SimEngine;
  private jitter = mulberry32(7);
  private actor = "Operator";

  constructor(engine: SimEngine) {
    this.engine = engine;
  }
  setActor(name: string) {
    this.actor = name;
  }

  private get w() {
    return this.engine.w;
  }
  private read<T>(fn: () => T): Promise<T> {
    const ms = 120 + this.jitter() * 230;
    return new Promise((resolve, reject) =>
      setTimeout(() => {
        try {
          resolve(structuredClone(fn()));
        } catch (e) {
          reject(e);
        }
      }, ms),
    );
  }
  private write<T>(fn: () => T): Promise<T> {
    return new Promise((resolve, reject) =>
      setTimeout(() => {
        try {
          resolve(structuredClone(fn()));
        } catch (e) {
          reject(e instanceof PlaybookError ? new HttpError(409, e.message) : e);
        }
      }, 60),
    );
  }

  login(identityCode: string) {
    return this.read<Session>(() => {
      const id = IDENTITIES.find((x) => x.code === identityCode);
      if (!id) throw new HttpError(404, "Unknown identity");
      const hero = this.w.homeByCode.get(heroCode(this.w))!;
      return {
        token: `mock-${id.code.toLowerCase()}`,
        user: { id: IDENTITIES.indexOf(id) + 1, name: id.name, role: id.role, homeId: id.role === "HOMEOWNER" ? hero.id : null },
      };
    });
  }
  getFleetSummary() {
    return this.read(() => fleetSummary(this.w, this.engine.uplinkDown));
  }
  listSettlements() {
    return this.read(() => this.w.settlements.map((s) => settlementDto(this.w, s)));
  }
  getSettlementByCode(code: string) {
    return this.read(() => {
      const s = this.w.settlements.find((x) => x.code === code.toUpperCase());
      if (!s) throw new HttpError(404, `No settlement ${code}`);
      return settlementDto(this.w, s);
    });
  }
  listDomes(settlementId: Id) {
    return this.read(() => this.w.domes.filter((d) => d.settlementId === settlementId).map((d) => domeDto(this.w, d)));
  }
  listMapFeatures(settlementId: Id) {
    return this.read(() => this.w.features.filter((f) => f.settlementId === settlementId));
  }
  listHomes(domeId: Id) {
    return this.read(() => {
      const d = this.w.domes.find((x) => x.id === domeId);
      if (!d) throw new HttpError(404, "No such dome");
      return d.homeIds.map((id) => homeSummary(this.w.homeById.get(id)!));
    });
  }
  getHomeByCode(code: string) {
    return this.read(() => {
      const h = this.w.homeByCode.get(code.toUpperCase());
      if (!h) throw new HttpError(404, `No home ${code}`);
      return homeDetail(h);
    });
  }
  getTelemetryHistory(homeId: Id, fromIso: IsoInstant, toIso: IsoInstant) {
    return this.read(() => {
      const h = this.w.homeById.get(homeId);
      const from = Date.parse(fromIso);
      const to = Date.parse(toIso);
      return (h?.snapshots?.toArray() ?? []).filter((s) => {
        const t = Date.parse(s.ts);
        return t >= from && t <= to;
      });
    });
  }
  listPredictions(homeId: Id) {
    return this.read(() => this.w.homeById.get(homeId)?.predictions ?? []);
  }
  listAlerts(q: { open?: boolean; page?: number; size?: number }) {
    return this.read<Page<(typeof this.w.alerts)[number]>>(() => {
      const all = this.w.alerts.filter((a) => (q.open ? !a.clearedAt : true)).slice().reverse();
      const size = q.size ?? 50;
      const number = q.page ?? 0;
      return {
        content: all.slice(number * size, number * size + size),
        page: { size, number, totalElements: all.length, totalPages: Math.ceil(all.length / size) },
      };
    });
  }
  acknowledgeAlert(alertId: Id) {
    return this.write(() => {
      const a = this.w.alerts.find((x) => x.id === alertId);
      if (!a) throw new HttpError(404, "No such alert");
      a.acknowledgedAt ??= isoAt(this.w);
      a.acknowledgedBy ??= this.actor;
      const ox = newOutbox();
      ox.alerts.push({ type: "UPDATED", alert: { ...a } });
      this.engine.flush(ox);
      return a;
    });
  }
  listIncidents(q: { open?: boolean }) {
    return this.read(() =>
      this.w.incidents
        .filter((i) => (q.open ? i.status !== "RESOLVED" : true))
        .map(incidentDto)
        .reverse(),
    );
  }
  getIncidentByCode(code: string) {
    return this.read<IncidentBundle>(() => {
      const inc = this.w.incidents.find((i) => i.code === code.toUpperCase());
      if (!inc) throw new HttpError(404, `There's no incident ${code}. Reloading restarts the simulation, so older incident links stop working.`);
      const run = this.w.runs.find((r) => r.id === inc.runId);
      const d = this.w.dispatches.find((x) => x.incidentId === inc.id);
      return {
        incident: incidentDto(inc),
        events: inc.events,
        alerts: this.w.alerts.filter((a) => inc.alertIds.includes(a.id)),
        run: run ? runDto(run) : null,
        dispatch: d ? dispatchDto(d) : null,
      };
    });
  }
  acknowledgeIncident(incidentId: Id) {
    return this.write(() => {
      const inc = this.incident(incidentId);
      const ox = newOutbox();
      if (!inc.acknowledgedAt) {
        inc.acknowledgedAt = isoAt(this.w);
        inc.assignee = this.actor;
        if (inc.status === "DETECTED") inc.status = "ACKNOWLEDGED";
        const run = this.w.runs.find((r) => r.id === inc.runId);
        if (run) {
          run.autoRunAt = null;
          run.autoRunTick = null;
          ox.runs.push(runDto(run));
        }
        for (const id of inc.alertIds) {
          const a = this.w.alerts.find((x) => x.id === id)!;
          a.acknowledgedAt ??= inc.acknowledgedAt;
          a.acknowledgedBy ??= this.actor;
          ox.alerts.push({ type: "UPDATED", alert: { ...a } });
        }
        addEvent(this.w, inc, "ACKNOWLEDGED", this.actor, `Acknowledged by ${this.actor}.`, ox);
      }
      this.engine.flush(ox);
      return incidentDto(inc);
    });
  }
  addIncidentNote(incidentId: Id, text: string) {
    return this.write(() => {
      const ox = newOutbox();
      const ev = addEvent(this.w, this.incident(incidentId), "NOTE", this.actor, text.trim().slice(0, 500), ox);
      this.engine.flush(ox);
      return ev;
    });
  }
  listPlaybooks() {
    return this.read(() => PLAYBOOKS);
  }
  startPlaybook(incidentId: Id) {
    return this.write(() => {
      const inc = this.incident(incidentId);
      const run = this.w.runs.find((r) => r.id === inc.runId);
      if (!run) throw new HttpError(409, "There is no playbook for this kind of incident.");
      const ox = newOutbox();
      if (!inc.acknowledgedAt) {
        inc.acknowledgedAt = isoAt(this.w);
        inc.assignee = this.actor;
      }
      startRun(this.w, run, this.actor, ox, this.jitter);
      this.engine.flush(ox);
      return runDto(run);
    });
  }
  executeStep(runId: Id, stepCode: string) {
    return this.write(() => {
      const run = this.w.runs.find((r) => r.id === runId);
      if (!run) throw new HttpError(404, "No such playbook run");
      const ox = newOutbox();
      confirmStep(this.w, run, stepCode, this.actor, ox, this.jitter);
      this.engine.flush(ox);
      this.engine.publishNow();
      return runDto(run);
    });
  }
  setHatchState(homeId: Id, hatchId: Id, state: "OPEN" | "SEALED") {
    return this.write<Hatch>(() => {
      const h = this.w.homeById.get(homeId);
      const hatch = h?.hatches.find((x) => x.id === hatchId);
      if (!h || !hatch) throw new HttpError(404, "No such hatch");
      if (hatch.roomBId === null && state === "OPEN") throw new HttpError(409, "The outer airlock hatch can't be opened from here.");
      if (hatch.state !== state) {
        hatch.state = state;
        splitZones(this.w, h);
      }
      const { id, code, roomAId, roomBId, x, y, orientation, widthM } = hatch;
      return { id, code, roomAId, roomBId, x, y, orientation, widthM, state: hatch.state };
    });
  }
  dispatchCrew(incidentId: Id) {
    return this.write(() => {
      const inc = this.incident(incidentId);
      const home = inc.homeId !== null ? this.w.homeById.get(inc.homeId) : undefined;
      if (!home) throw new HttpError(409, "This incident has no home to send a crew to.");
      const run = this.w.runs.find((r) => r.id === inc.runId);
      const ox = newOutbox();
      const actorRun = run ?? ({ actor: this.actor } as never);
      const d = createDispatch({ w: this.w, run: actorRun, inc, home, ox, rng: this.jitter });
      this.engine.flush(ox);
      return dispatchDto(d);
    });
  }
  listRegionalEvents() {
    return this.read(() => this.w.regionalEvents.map(regionalDto));
  }
  listWorkOrders() {
    return this.read(() => this.w.workOrders);
  }
  listSubscriptions() {
    return this.read(() => this.w.subscriptions);
  }

  sim = {
    injectScenario: async (req: Parameters<HabitatApi["sim"]["injectScenario"]>[0]) => this.engine.inject(req),
    setSpeed: async (m: 1 | 10 | 60 | 300) => this.engine.setSpeed(m),
    setLocalTime: async (settlementId: Id, lmstHours: number) => this.engine.setLocalTime(settlementId, lmstHours),
    reset: async (seed?: number) => {
      this.engine.reset(seed);
      this.engine.publishNow();
    },
  };

  private incident(id: Id) {
    const inc = this.w.incidents.find((i) => i.id === id);
    if (!inc) throw new HttpError(404, "No such incident");
    return inc;
  }
}
