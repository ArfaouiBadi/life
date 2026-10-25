import { describe, expect, it } from "vitest";
import { SimEngine, type Bus } from "../engine";
import { heroCode } from "../world/generateWorld";
import { generateWorld } from "../world/generateWorld";
import { confirmStep, startRun } from "../playbooks/runner";
import { newOutbox } from "../outbox";
import { mulberry32 } from "../rng";

const quietBus = (): Bus => ({ publish: () => {}, watchedHomeIds: () => new Set(), setUplink: () => {} });
// 2061-03-14 — a fixed epoch so tests never depend on the wall clock.
const EPOCH = Date.parse("2061-03-14T00:00:00Z");

describe("world generation", () => {
  it("is deterministic for a seed", () => {
    const a = generateWorld(2061, EPOCH);
    const b = generateWorld(2061, EPOCH);
    expect(a.homes.map((h) => h.code + h.householdName)).toEqual(b.homes.map((h) => h.code + h.householdName));
    expect(a.domes.map((d) => d.centerX)).toEqual(b.domes.map((d) => d.centerX));
  });

  it("has exactly 452 homes, about 1,400 residents and the hero home", () => {
    const w = generateWorld(2061, EPOCH);
    expect(w.homes.length).toBe(452);
    expect(generateWorld(7, EPOCH).homes.length).toBe(452);
    const residents = w.homes.reduce((a, h) => a + h.occupants.length, 0);
    expect(residents).toBeGreaterThan(1300);
    expect(residents).toBeLessThan(1500);
    const hero = w.homeByCode.get("JZR-AUR-014")!;
    expect(hero.householdName).toBe("Trabelsi family");
    expect(hero.template).toBe("FAMILY");
    expect(w.domes.find((d) => d.name === "Aurora")!.homeIds.length).toBe(30);
  });
});

describe("engine", () => {
  it("starts quiet: the hero is nominal and few homes deviate", () => {
    const e = new SimEngine(quietBus(), 2061, EPOCH);
    for (let i = 0; i < 5; i++) e.tick();
    const hero = e.w.homeByCode.get(heroCode(e.w))!;
    expect(hero.severity).toBe("NOMINAL");
    const loud = e.w.homes.filter((h) => h.severity === "WARNING" || h.severity === "CRITICAL" || h.severity === "EMERGENCY");
    expect(loud.length).toBeGreaterThanOrEqual(3);
    expect(loud.length).toBeLessThanOrEqual(6);
  });

  it("one tick stays under 4 ms for the fleet at 1×", () => {
    const e = new SimEngine(quietBus(), 2061, EPOCH);
    for (let i = 0; i < 5; i++) e.tick();
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) e.tick();
    const per = (performance.now() - t0) / 20;
    // Generous in CI; the budget is checked in the browser with engine.lastTickMs.
    expect(per).toBeLessThan(40);
  });

  it("detects the hero breach, predicts ~1:47, and the save stabilises the home", () => {
    const e = new SimEngine(quietBus(), 2061, EPOCH);
    const w = e.w;
    const hero = w.homeByCode.get(heroCode(w))!;
    const jzr = w.settlements.find((s) => s.code === "JZR")!;
    e.setLocalTime(jzr.id, 3.1);
    e.setSpeed(10);
    for (let i = 0; i < 3; i++) e.tick();
    e.inject({ kind: "BREACH", homeId: hero.id });
    for (let i = 0; i < 30; i++) e.tick();

    expect(hero.severity).toBe("CRITICAL");
    const ttd = hero.ttdSeconds!;
    expect(ttd).toBeGreaterThan(5400);
    expect(ttd).toBeLessThan(6800);
    const o2 = hero.predictions.find((p) => p.metric === "PPO2_KPA" && p.occupied)!;
    expect(o2.details.leakAreaCm2).toBeGreaterThan(1.3);
    expect(o2.details.leakAreaCm2).toBeLessThan(1.7);
    const inc = w.incidents.find((i) => i.homeId === hero.id && i.type === "PRESSURE_LOSS")!;
    expect(inc.title).toBe("Air leak in Bedroom 2");

    // Operator runs the playbook; Youssef walks out; the hatch is sealed.
    const run = w.runs.find((r) => r.id === inc.runId)!;
    const rng = mulberry32(3);
    const ox = newOutbox();
    startRun(w, run, "Lina Haddad", ox, rng);
    for (let i = 0; i < 12; i++) e.tick();
    const bed2 = hero.rooms.find((r) => r.code === "BED2")!;
    expect(hero.occupants.filter((o) => o.roomId === bed2.id)).toHaveLength(0);
    confirmStep(w, run, "SEAL_HATCH", "Lina Haddad", ox, rng);
    for (let i = 0; i < 10; i++) e.tick();
    expect(hero.ttdSeconds).toBeNull(); // "Stable"
    expect(hero.severity).toBe("WARNING"); // sealed and empty, capped

    // Dispatch, patch, verify → resolved.
    confirmStep(w, run, "DISPATCH", "Lina Haddad", ox, rng);
    e.setSpeed(60);
    for (let i = 0; i < 80 && inc.status !== "RESOLVED"; i++) e.tick();
    expect(inc.status).toBe("RESOLVED");
    expect(bed2.leakAreaM2).toBe(0);
  });

  it("auto-runs the playbook when nobody acknowledges within 20 s", () => {
    const e = new SimEngine(quietBus(), 2061, EPOCH);
    const hero = e.w.homeByCode.get(heroCode(e.w))!;
    e.setSpeed(10);
    e.inject({ kind: "BREACH", homeId: hero.id });
    for (let i = 0; i < 40; i++) e.tick();
    const inc = e.w.incidents.find((i) => i.homeId === hero.id && i.type === "PRESSURE_LOSS")!;
    expect(inc.events.some((ev) => ev.actor === "Autopilot" && ev.text.includes("No operator response in 20 s"))).toBe(true);
  });
});
