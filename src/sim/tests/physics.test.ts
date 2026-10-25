import { describe, expect, it } from "vitest";
import { estimateLeakAreaCm2, fitExpDecay, onsetIndex, secondsToThreshold } from "../predict/regression";
import { computeZones, leakRate } from "../physics/atmosphere";
import { energyBalanceSecondsToEmpty } from "../physics/power";
import { gaussian, mulberry32 } from "../rng";
import { TEMPLATES } from "../world/templates";
import { hexRing, hexSpiral } from "@/lib/hex";
import { localMeanSolarTime, marsTime } from "@/lib/marsTime";

const A = 1.5e-4; // 1.5 cm²
const V = 416;

describe("leak physics", () => {
  it("k for the worked example is 4.37e-5 /s", () => {
    expect(leakRate(A, V)).toBeCloseTo(4.37e-5, 7);
  });

  it("fitExpDecay recovers k within 2% on noisy data (σ 0.02 kPa)", () => {
    const rng = mulberry32(1);
    const k = leakRate(A, V);
    const samples = Array.from({ length: 120 }, (_, i) => {
      const t = i * 5;
      return { t, v: 101.3 * Math.exp(-k * t) + gaussian(rng, 0.02) };
    });
    const fit = fitExpDecay(samples)!;
    expect(Math.abs(fit.k - k) / k).toBeLessThan(0.02);
    expect(fit.r2).toBeGreaterThan(0.9);
  });

  it("secondsToThreshold matches the worked example (6,440 s ± 1%)", () => {
    const s = secondsToThreshold(21.2, 16.0, leakRate(A, V))!;
    expect(Math.abs(s - 6440) / 6440).toBeLessThan(0.01);
  });

  it("a sealed bedroom reaches unsafe air in about 644 s", () => {
    const s = secondsToThreshold(21.2, 16.0, leakRate(A, 41.6))!;
    expect(Math.abs(s - 644) / 644).toBeLessThan(0.01);
  });

  it("estimateLeakAreaCm2 returns 1.5 ± 0.05", () => {
    expect(estimateLeakAreaCm2(leakRate(A, V), V)).toBeCloseTo(1.5, 1);
    expect(Math.abs(estimateLeakAreaCm2(leakRate(A, V), V) - 1.5)).toBeLessThan(0.05);
  });

  it("returns null when not decaying", () => {
    expect(secondsToThreshold(21.2, 16, 0)).toBeNull();
    expect(secondsToThreshold(15, 16, 1e-4)).toBe(0);
  });
});

describe("zones", () => {
  const t = TEMPLATES.FAMILY;
  const rooms = t.rooms.map((r, i) => ({ id: i + 1, code: r.code, volumeM3: r.w * r.h * 2.6 }));
  const id = (code: string) => rooms.find((r) => r.code === code)!.id;
  const hatches = t.hatches.map((h) => ({
    code: h.code,
    roomAId: id(h.a),
    roomBId: h.b ? id(h.b) : null,
    state: (h.sealed ? "SEALED" : "OPEN") as "OPEN" | "SEALED",
  }));

  it("the connected living volume of a FAMILY home is 416 m³", () => {
    const zones = computeZones(rooms, hatches);
    const main = zones.find((z) => z.roomIds.includes(id("LIV")))!;
    expect(main.volumeM3).toBeCloseTo(416, 5);
  });

  it("sealing BED2 yields zones of 41.6 m³ and 374.4 m³", () => {
    const sealed = hatches.map((h) => (h.code === "H-BED2" ? { ...h, state: "SEALED" as const } : h));
    const zones = computeZones(rooms, sealed);
    const bed2 = zones.find((z) => z.roomIds.includes(id("BED2")))!;
    const rest = zones.find((z) => z.roomIds.includes(id("LIV")))!;
    expect(bed2.volumeM3).toBeCloseTo(41.6, 5);
    expect(rest.volumeM3).toBeCloseTo(374.4, 5);
  });

  it("the POD living volume is 156 m³", () => {
    const p = TEMPLATES.POD;
    const pr = p.rooms.map((r, i) => ({ id: i + 1, code: r.code, volumeM3: r.w * r.h * 2.6 }));
    const pid = (c: string) => pr.find((r) => r.code === c)!.id;
    const ph = p.hatches.map((h) => ({ roomAId: pid(h.a), roomBId: h.b ? pid(h.b) : null, state: (h.sealed ? "SEALED" : "OPEN") as "OPEN" | "SEALED" }));
    expect(computeZones(pr, ph).find((z) => z.roomIds.includes(pid("MAIN")))!.volumeM3).toBeCloseTo(156, 5);
  });
});

describe("hex spiral", () => {
  it("has 1, 6, 12, 18 tiles per ring, no duplicates, center first", () => {
    const tiles = hexSpiral(37);
    expect(tiles[0]).toEqual({ q: 0, r: 0 });
    const counts = [0, 0, 0, 0];
    for (const t of tiles) counts[hexRing(t)]++;
    expect(counts).toEqual([1, 6, 12, 18]);
    expect(new Set(tiles.map((t) => `${t.q},${t.r}`)).size).toBe(37);
  });
});

describe("Mars time", () => {
  it("2000-01-06T00:00:00Z is MSD ≈ 44795.9998 and MTC ≈ 23:59:39", () => {
    const m = marsTime(new Date("2000-01-06T00:00:00Z"));
    expect(Math.abs(m.msd - 44795.9998)).toBeLessThan(0.0003);
    const mtcS = m.mtcHours * 3600;
    expect(Math.abs(mtcS - (23 * 3600 + 59 * 60 + 39))).toBeLessThan(10);
  });

  it("LMST equals MTC at longitude 0 and adds 1 hour per 15° east", () => {
    expect(localMeanSolarTime(10, 0)).toBe(10);
    expect(localMeanSolarTime(10, 15)).toBeCloseTo(11, 10);
    expect(localMeanSolarTime(23.5, 30)).toBeCloseTo(1.5, 10);
    expect(localMeanSolarTime(1, -30)).toBeCloseTo(23, 10);
  });
});

describe("energy balance", () => {
  it("0 solar and a 3 kW load empties a 60 kWh battery in 20 hours", () => {
    const s = energyBalanceSecondsToEmpty(60, 60, () => -3)!;
    expect(s).toBeCloseTo(20 * 3600, 0);
  });
  it("returns null when the battery lasts the horizon", () => {
    expect(energyBalanceSecondsToEmpty(60, 60, () => 0.5)).toBeNull();
  });
});

describe("onset detection", () => {
  it("drops flat pre-breach samples so the fit sees only the decay", () => {
    const rng = mulberry32(5);
    const k = leakRate(A, V);
    const values = Array.from({ length: 120 }, (_, i) => {
      const t = i * 5;
      const p = t < 400 ? 101.3 : 101.3 * Math.exp(-k * (t - 400));
      return p + gaussian(rng, 0.02);
    });
    const start = onsetIndex(values, 0.02);
    expect(start * 5).toBeGreaterThanOrEqual(380);
    const fit = fitExpDecay(values.slice(start).map((v, i) => ({ t: (start + i) * 5, v })))!;
    expect(Math.abs(fit.k - k) / k).toBeLessThan(0.1);
  });
});
