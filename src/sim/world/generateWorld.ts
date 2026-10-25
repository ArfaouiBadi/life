import type { EquipmentType, HomeTemplate, Id, MapFeature, PlanTier, Subscription } from "@/api/contracts";
import { hexSpiral } from "@/lib/hex";
import { isNight, lmstAt } from "@/lib/marsTime";
import { chance, int, mulberry32, pick, range, shuffle, type Rng } from "../rng";
import { Ring } from "../ring";
import { PHYS } from "../physics/constants";
import { GIVEN, SURNAMES, initialsOf } from "./names";
import { FRAME_H, FRAME_W, HERO, SETTLEMENTS, TOTAL_HOMES } from "./settlements";
import { TEMPLATES } from "./templates";
import type { SimDome, SimEquipment, SimHome, SimOccupant, SimRoom, SimSettlement, World } from "./types";

export const HISTORY_SAMPLES = 120;
export const PLAN_PRICE: Record<PlanTier, number> = { BASIC: 49, FAMILY: 89, PREMIUM: 149, SETTLEMENT: 0 };

export function newId(w: Pick<World, "nextId">, kind: string): Id {
  w.nextId[kind] = (w.nextId[kind] ?? 0) + 1;
  return w.nextId[kind];
}

export function generateWorld(seed: number, epochMs: number): World {
  const rng = mulberry32(seed);
  const w: World = {
    seed,
    epochMs,
    t: 0,
    tick: 0,
    speed: 1,
    uplinkDownUntilTick: null,
    settlements: [],
    domes: [],
    homes: [],
    features: [],
    alerts: [],
    incidents: [],
    runs: [],
    dispatches: [],
    regionalEvents: [],
    workOrders: [],
    subscriptions: [],
    nextId: {},
    homeById: new Map(),
    homeByCode: new Map(),
  };

  const domeSizes = planDomeSizes(seed);
  // Where people start depends on the clock (asleep at night), so it draws from its own stream:
  // the same seed builds the same world whatever time the app is opened.
  const placeRng = mulberry32(seed ^ 0x2be);
  let domeIndex = 0;

  for (const def of SETTLEMENTS) {
    const s: SimSettlement = {
      id: newId(w, "settlement"),
      code: def.code,
      name: def.name,
      featureName: def.featureName,
      lat: def.lat,
      lon: def.lon,
      foundedYear: def.foundedYear,
      blurb: def.blurb,
      domeIds: [],
      frameWidthM: FRAME_W,
      frameHeightM: FRAME_H,
      dustTau: 0.5,
      doseMultiplier: 1,
      landingPad: [0, 0],
      tunnels: [],
      rovers: Array.from({ length: int(rng, 2, 4) }, (_, i) => `R-${i + 1}`),
      craterRadiusM: def.code === "JZR" ? 1180 : null,
    };
    w.settlements.push(s);

    const domes = placeDomes(rng, def.domes.length, s.craterRadiusM);
    def.domes.forEach((name, i) => {
      const d: SimDome = {
        id: newId(w, "dome"),
        code: name.slice(0, 3).toUpperCase(),
        name,
        settlementId: s.id,
        centerX: domes[i].x,
        centerY: domes[i].y,
        radiusM: domes[i].r,
        homeIds: [],
      };
      s.domeIds.push(d.id);
      w.domes.push(d);
    });
    const myDomes = w.domes.filter((d) => d.settlementId === s.id);
    buildInfrastructure(w, rng, s, myDomes);

    for (const d of myDomes) {
      const isHeroDome = def.code === HERO.settlement && d.name === HERO.dome;
      const n = domeSizes[domeIndex++];
      const slots = hexSpiral(n + 1);
      for (let i = 1; i <= n; i++) {
        const hero = isHeroDome && i === HERO.homeIndex;
        const home = createHome(w, rng, placeRng, s, d, i, slots[i].q, slots[i].r, hero);
        d.homeIds.push(home.id);
        w.homes.push(home);
        w.homeById.set(home.id, home);
        w.homeByCode.set(home.code, home);
      }
    }
  }

  applyBaseline(w, rng);
  return w;
}

/**
 * Homes per dome (18 to 36, the hero dome exactly 30), nudged so the fleet totals exactly
 * TOTAL_HOMES. Drawn from their own stream so dome placement doesn't depend on them.
 */
export function planDomeSizes(seed: number): number[] {
  const rng = mulberry32(seed ^ 0x1c4);
  const defs = SETTLEMENTS.flatMap((s) => s.domes.map((name) => s.code === HERO.settlement && name === HERO.dome));
  const sizes = defs.map((hero) => (hero ? HERO.domeHomes : int(rng, 18, 36)));
  const free = defs.map((hero, i) => (hero ? -1 : i)).filter((i) => i >= 0);
  let diff = TOTAL_HOMES - sizes.reduce((a, b) => a + b, 0);
  // Take from the largest domes or give to the smallest, one home at a time.
  while (diff !== 0) {
    const order = [...free].sort((a, b) => (diff > 0 ? sizes[a] - sizes[b] : sizes[b] - sizes[a]) || a - b);
    const i = order.find((j) => (diff > 0 ? sizes[j] < 36 : sizes[j] > 18));
    if (i === undefined) break;
    sizes[i] += Math.sign(diff);
    diff -= Math.sign(diff);
  }
  return sizes;
}

function placeDomes(rng: Rng, count: number, craterR: number | null) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const out: { x: number; y: number; r: number }[] = [];
    for (let tries = 0; out.length < count && tries < 3000; tries++) {
      const r = range(rng, 150, 230);
      let x: number, y: number;
      if (craterR) {
        const a = rng() * Math.PI * 2;
        const dist = Math.sqrt(rng()) * (craterR - 260 - r);
        x = FRAME_W / 2 + Math.cos(a) * dist;
        y = FRAME_H / 2 + Math.sin(a) * dist * 0.92;
      } else {
        x = range(rng, 300 + r, FRAME_W - 300 - r);
        y = range(rng, 300 + r, FRAME_H - 300 - r);
      }
      if (out.every((o) => Math.hypot(o.x - x, o.y - y) >= o.r + r + 220)) out.push({ x, y, r });
    }
    if (out.length === count) return out;
  }
  throw new Error("Could not place domes");
}

function buildInfrastructure(w: World, rng: Rng, s: SimSettlement, domes: SimDome[]) {
  const feat = (kind: MapFeature["kind"], name: string | null, points: [number, number][]) =>
    w.features.push({ id: newId(w, "feature"), settlementId: s.id, kind, name, points });

  // Tunnels: minimum spanning tree (Prim) plus the shortest extra edge, so there is one loop.
  const dist = (a: SimDome, b: SimDome) => Math.hypot(a.centerX - b.centerX, a.centerY - b.centerY);
  const inTree = new Set([0]);
  const edges: [number, number][] = [];
  while (inTree.size < domes.length) {
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (const i of inTree)
      domes.forEach((d, j) => {
        if (!inTree.has(j) && dist(domes[i], d) < bestD) {
          bestD = dist(domes[i], d);
          best = [i, j];
        }
      });
    edges.push(best!);
    inTree.add(best![1]);
  }
  let extra: [number, number] | null = null;
  let extraD = Infinity;
  for (let i = 0; i < domes.length; i++)
    for (let j = i + 1; j < domes.length; j++) {
      const used = edges.some(([a, b]) => (a === i && b === j) || (a === j && b === i));
      if (!used && dist(domes[i], domes[j]) < extraD) {
        extraD = dist(domes[i], domes[j]);
        extra = [i, j];
      }
    }
  if (extra) edges.push(extra);
  s.tunnels = edges.map(([i, j]) => [domes[i].id, domes[j].id]);
  for (const [i, j] of edges)
    feat("TUNNEL", `${domes[i].name}–${domes[j].name} tunnel`, edgePoints(domes[i], domes[j]));

  // Sites: landing pad, solar farm, ice plant, each away from the domes.
  const freeSpot = (minGap: number): [number, number] => {
    const cx = FRAME_W / 2;
    const cy = FRAME_H / 2;
    for (let i = 0; i < 4000; i++) {
      const x = range(rng, 260, FRAME_W - 260);
      const y = range(rng, 260, FRAME_H - 260);
      if (s.craterRadiusM && Math.hypot(x - cx, (y - cy) / 0.92) > s.craterRadiusM - 140) continue;
      if (domes.every((d) => Math.hypot(d.centerX - x, d.centerY - y) > d.radiusM + minGap)) return [x, y];
    }
    return [260, 260];
  };
  const nearestDome = (p: [number, number]) =>
    domes.reduce((a, b) => (Math.hypot(a.centerX - p[0], a.centerY - p[1]) < Math.hypot(b.centerX - p[0], b.centerY - p[1]) ? a : b));
  const road = (p: [number, number], name: string) => {
    const d = nearestDome(p);
    const ang = Math.atan2(p[1] - d.centerY, p[0] - d.centerX);
    feat("ROAD", name, [p, [d.centerX + Math.cos(ang) * d.radiusM, d.centerY + Math.sin(ang) * d.radiusM]]);
  };

  const pad = freeSpot(320);
  s.landingPad = pad;
  feat("LANDING_PAD", "Landing pad", square(pad, 70));
  road(pad, "Pad road");

  const solar = freeSpot(360);
  feat("SOLAR_FARM", "Solar farm", rect(solar, 260, 160));
  road(solar, "Solar road");

  const ice = freeSpot(300);
  feat("ICE_PLANT", "Ice plant", square(ice, 50));
  road(ice, "Ice road");
}

function edgePoints(a: SimDome, b: SimDome): [number, number][] {
  const ang = Math.atan2(b.centerY - a.centerY, b.centerX - a.centerX);
  return [
    [a.centerX + Math.cos(ang) * a.radiusM, a.centerY + Math.sin(ang) * a.radiusM],
    [b.centerX - Math.cos(ang) * b.radiusM, b.centerY - Math.sin(ang) * b.radiusM],
  ];
}
const square = (c: [number, number], h: number): [number, number][] => rect(c, h * 2, h * 2);
const rect = (c: [number, number], wM: number, hM: number): [number, number][] => [
  [c[0] - wM / 2, c[1] - hM / 2],
  [c[0] + wM / 2, c[1] - hM / 2],
  [c[0] + wM / 2, c[1] + hM / 2],
  [c[0] - wM / 2, c[1] + hM / 2],
];

const EQUIPMENT: { type: EquipmentType; name: string; inLifeSupport: boolean }[] = [
  { type: "O2_GENERATOR", name: "Oxygen generator", inLifeSupport: true },
  { type: "CO2_SCRUBBER", name: "CO₂ scrubber", inLifeSupport: true },
  { type: "WATER_RECYCLER", name: "Water recycler", inLifeSupport: true },
  { type: "BATTERY_BANK", name: "Battery bank", inLifeSupport: true },
  { type: "SOLAR_ARRAY", name: "Solar array", inLifeSupport: false },
  { type: "HEATER", name: "Heater", inLifeSupport: true },
  { type: "FIRE_SUPPRESSION", name: "Fire suppression", inLifeSupport: false },
];

function createHome(
  w: World,
  rng: Rng,
  placeRng: Rng,
  s: SimSettlement,
  d: SimDome,
  index: number,
  q: number,
  r: number,
  hero: boolean,
): SimHome {
  const template: HomeTemplate = hero ? "FAMILY" : chance(rng, 0.35) ? "POD" : "FAMILY";
  const planRoll = rng();
  const plan: PlanTier = hero ? "PREMIUM" : planRoll < 0.3 ? "BASIC" : planRoll < 0.75 ? "FAMILY" : "PREMIUM";
  const t = TEMPLATES[template];
  const surname = hero ? HERO.household : pick(rng, SURNAMES);
  const id = newId(w, "home");

  const rooms: SimRoom[] = t.rooms.map((rd) => ({
    id: newId(w, "room"),
    code: rd.code,
    name: rd.name,
    type: rd.type,
    x: rd.x,
    y: rd.y,
    w: rd.w,
    h: rd.h,
    volumeM3: +(rd.w * rd.h * PHYS.CEILING_M).toFixed(1),
    hostsLifeSupport: !!rd.lifeSupport,
    isShelter: !!rd.shelter,
    shielding: rd.shelter ? PHYS.SHELTER_FACTOR : 1,
    pN2: PHYS.PN2_NOMINAL,
    ppO2: PHYS.PPO2_NOMINAL,
    co2: range(rng, 560, 640),
    tempC: range(rng, 20.6, 21.4),
    humidity: range(rng, 42, 48),
    smoke: 0,
    dose: PHYS.BASE_DOSE_USVH * (rd.shelter ? PHYS.SHELTER_FACTOR : 1),
    leakAreaM2: 0,
    fire: false,
    suppressed: false,
    history: new Ring(HISTORY_SAMPLES),
    zoneSince: 0,
    severity: "NOMINAL",
    downSince: null,
    acoustic: 0.02,
  }));
  const byCode = new Map(rooms.map((x) => [x.code, x]));
  const hatches = t.hatches.map((hd) => ({
    id: newId(w, "hatch"),
    code: hd.code,
    roomAId: byCode.get(hd.a)!.id,
    roomBId: hd.b ? byCode.get(hd.b)!.id : null,
    x: hd.x,
    y: hd.y,
    orientation: hd.orientation,
    widthM: 0.9,
    state: hd.sealed ? ("SEALED" as const) : ("OPEN" as const),
  }));

  const lifeRoom = rooms.find((x) => x.hostsLifeSupport)!;
  const fireRoom = rooms.find((x) => x.type === "KITCHEN" || x.code === "MAIN")!;
  const equipment: SimEquipment[] = EQUIPMENT.map((e) => {
    const power = e.type === "BATTERY_BANK" || e.type === "SOLAR_ARRAY";
    return {
      id: newId(w, "equipment"),
      type: e.type,
      name: e.name,
      roomId: e.type === "SOLAR_ARRAY" ? null : e.inLifeSupport ? lifeRoom.id : fireRoom.id,
      // Starts at 86–100% (not 82%) so the fleet is not mostly "maintenance due"; see DECISIONS.md.
      healthPct: hero ? range(rng, 95, 100) : power ? range(rng, 90, 100) : range(rng, 86, 100),
      status: "OK" as const,
      degradePerSol: range(rng, 0.05, 0.3),
    };
  });

  const bedrooms = rooms.filter((x) => x.type === "BEDROOM");
  const occupants: SimOccupant[] = [];
  if (hero) {
    for (const o of HERO.occupants) {
      const bed = byCode.get(o.bed)!;
      occupants.push(person(w, o.name, o.age, o.homeowner, bed));
    }
  } else {
    const n = template === "POD" ? int(rng, 1, 2) : int(rng, 3, 5);
    const usedGiven = new Set<string>();
    for (let k = 0; k < n; k++) {
      let given = pick(rng, GIVEN);
      while (usedGiven.has(given)) given = pick(rng, GIVEN);
      usedGiven.add(given);
      const adult = k < 2;
      const age = adult ? int(rng, 26, 64) : int(rng, 2, 17);
      // Parents share the first bedroom; children spread over the rest.
      const bed = template === "POD" ? bedrooms[0] : adult ? bedrooms[0] : bedrooms[1 + ((k - 2) % 2)];
      occupants.push(person(w, `${given} ${surname}`, age, k === 0, bed));
    }
  }

  const lmst = lmstAt(w.epochMs, s.lon);
  for (const o of occupants) {
    const room = isNight(lmst) ? rooms.find((x) => x.id === o.bedRoomId)! : pick(placeRng, rooms.filter((x) => x.type !== "AIRLOCK"));
    placeIn(placeRng, o, room);
    o.nextMoveAt = range(placeRng, 60, 2400);
  }

  const family = template === "FAMILY";
  const home: SimHome = {
    id,
    code: `${s.code}-${d.code}-${String(index).padStart(3, "0")}`,
    domeId: d.id,
    settlementId: s.id,
    hexQ: q,
    hexR: r,
    template,
    plan,
    householdName: `${surname} family`,
    widthM: t.widthM,
    depthM: t.depthM,
    rooms,
    hatches,
    occupants,
    equipment,
    batteryCapKWh: family ? 60 : 30,
    batteryKWh: 0,
    solarPeakKW: family ? 9 : 5,
    solarKW: 0,
    loadKW: 0,
    loadsShed: false,
    waterTankCapL: family ? 2000 : 900,
    waterTankL: 0,
    waterUseLSol: PHYS.WATER_USE_L_SOL,
    o2ReservePct: 100,
    o2BleedRoomId: null,
    repressurizing: false,
    powerCutRoomId: null,
    scrubSmoke: false,
    zones: null,
    link: "ONLINE",
    gatewayOfflineUntilTick: null,
    lastHeartbeatTick: 0,
    conds: new Map(),
    severity: "NOMINAL",
    ttdSeconds: null,
    predictions: [],
    batteryTtd: null,
    batteryTtdAt: -Infinity,
    snapshots: null,
    lastRoomSeverities: [],
  };
  home.batteryKWh = home.batteryCapKWh * range(rng, 0.9, 1);
  home.waterTankL = home.waterTankCapL * range(rng, 0.7, 0.95);

  const sub: Subscription = {
    id: newId(w, "subscription"),
    homeId: id,
    plan,
    monthlyPrice: PLAN_PRICE[plan],
    startedAt: new Date(w.epochMs - range(rng, 30, 900) * 86400000).toISOString(),
    status: chance(rng, 0.05) ? "TRIAL" : chance(rng, 0.03) ? "PAST_DUE" : "ACTIVE",
  };
  w.subscriptions.push(sub);
  return home;
}

function person(w: World, name: string, age: number, homeowner: boolean, bed: SimRoom): SimOccupant {
  return {
    id: newId(w, "occupant"),
    name,
    initials: initialsOf(name),
    age,
    isHomeowner: homeowner,
    bedRoomId: bed.id,
    roomId: bed.id,
    x: bed.x + bed.w / 2,
    y: bed.y + bed.h / 2,
    path: [],
    nextMoveAt: 0,
    override: null,
  };
}

export function placeIn(rng: Rng, o: SimOccupant, room: SimRoom) {
  const inset = Math.min(0.7, room.w / 4, room.h / 4);
  o.roomId = room.id;
  o.x = range(rng, room.x + inset, room.x + room.w - inset);
  o.y = range(rng, room.y + inset, room.y + room.h - inset);
  o.path = [];
}

/** Baseline deviations so the dark cockpit has a few believable things to show (section 7.8). */
function applyBaseline(w: World, rng: Rng) {
  const hero = w.homes.find((h) => h.code === heroCode(w));
  const others = shuffle(rng, w.homes.filter((h) => h !== hero));
  const eq = (h: SimHome, type: EquipmentType) => h.equipment.find((e) => e.type === type)!;

  // Two homes: CO2 scrubber at 62% → CO2 creeping up.
  for (const h of others.slice(0, 2)) {
    eq(h, "CO2_SCRUBBER").healthPct = 62;
    for (const r of h.rooms) if (r.type !== "AIRLOCK") r.co2 = range(rng, 760, 820);
  }
  // One home: recycler at 71% with a low tank.
  const water = others[2];
  eq(water, "WATER_RECYCLER").healthPct = 71;
  water.waterTankL = water.waterTankCapL * 0.36;
  // One home offline: gateway rebooting, back after 90 real seconds.
  const off = others[3];
  off.gatewayOfflineUntilTick = 90;
  off.lastHeartbeatTick = -20;
  // About 4% advisory: one item due for maintenance.
  const n = Math.round(w.homes.length * 0.04);
  for (const h of others.slice(4, 4 + n)) {
    const e = pick(rng, h.equipment.filter((x) => x.type !== "SOLAR_ARRAY"));
    e.healthPct = range(rng, 74, 84);
  }
  // Light dust over Arcadia Reach.
  const arc = w.settlements.find((s) => s.code === "ARC")!;
  arc.dustTau = 1.2;
}

export const heroCode = (w: World) => {
  const s = w.settlements.find((x) => x.code === HERO.settlement)!;
  const d = w.domes.find((x) => x.settlementId === s.id && x.name === HERO.dome)!;
  return `${s.code}-${d.code}-${String(HERO.homeIndex).padStart(3, "0")}`;
};

