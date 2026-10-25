import type { Id } from "@/api/contracts";
import type { SimHatch, SimHome, SimRoom, Zone } from "../world/types";
import { NOMINAL_PRESSURE, PHYS } from "./constants";

/** Zones = groups of rooms joined by OPEN hatches (union-find). The outside never joins a zone. */
export function computeZones(rooms: Pick<SimRoom, "id" | "volumeM3">[], hatches: Pick<SimHatch, "roomAId" | "roomBId" | "state">[]): Zone[] {
  const parent = new Map<Id, Id>(rooms.map((r) => [r.id, r.id]));
  const find = (x: Id): Id => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    while (parent.get(x) !== root) {
      const next = parent.get(x)!;
      parent.set(x, root);
      x = next;
    }
    return root;
  };
  for (const h of hatches) if (h.state === "OPEN" && h.roomBId !== null) parent.set(find(h.roomAId), find(h.roomBId));
  const groups = new Map<Id, Zone>();
  for (const r of rooms) {
    const root = find(r.id);
    const z = groups.get(root) ?? { roomIds: [], volumeM3: 0 };
    z.roomIds.push(r.id);
    z.volumeM3 += r.volumeM3;
    groups.set(root, z);
  }
  return [...groups.values()];
}

export function zonesOf(home: SimHome): Zone[] {
  if (!home.zones) home.zones = computeZones(home.rooms, home.hatches);
  return home.zones;
}

const zoneRooms = new WeakMap<Zone, SimRoom[]>();
/** Room objects of a zone, cached for as long as the zone itself is (zones reset on hatch changes). */
export function roomsOfZone(home: SimHome, zone: Zone): SimRoom[] {
  let rs = zoneRooms.get(zone);
  if (!rs) {
    rs = zone.roomIds.map((id) => home.rooms.find((r) => r.id === id)!);
    zoneRooms.set(zone, rs);
  }
  return rs;
}

/** k = CD·A·Γ·√(γRT)/V = 121.2·A/V  (choked flow, isothermal) */
export const leakRate = (areaM2: number, volumeM3: number) => (PHYS.LEAK_SPEED * areaM2) / volumeM3;

export interface AtmoContext {
  occupantsInRoom: Map<Id, number>;
  o2GenRoomId: Id | null;
  o2GenCapacityPeople: number;
  o2GenHealth: number; // 0..1
  scrubberRoomId: Id | null;
  scrubberHealth: number; // 0..1
}

/**
 * One sub-step for one home. Air mixes instantly within a zone: aggregate the rooms
 * (volume-weighted), apply sources and sinks, write the zone value back to every room.
 */
export function stepAtmosphere(home: SimHome, dt: number, ctx: AtmoContext) {
  for (const zone of zonesOf(home)) {
    const rs = roomsOfZone(home, zone);
    const V = zone.volumeM3;
    let pN2 = 0, ppO2 = 0, co2 = 0, temp = 0, smoke = 0, leak = 0, people = 0;
    let fire = false, suppressed = false, hasGen = false, hasScrub = false, bleed = false;
    for (const r of rs) {
      const f = r.volumeM3 / V;
      pN2 += r.pN2 * f;
      ppO2 += r.ppO2 * f;
      co2 += r.co2 * f;
      temp += r.tempC * f;
      smoke += r.smoke * f;
      leak += r.leakAreaM2;
      people += ctx.occupantsInRoom.get(r.id) ?? 0;
      if (r.fire) fire = true;
      if (r.suppressed) suppressed = true;
      if (r.id === ctx.o2GenRoomId) hasGen = true;
      if (r.id === ctx.scrubberRoomId) hasScrub = true;
      if (r.id === home.o2BleedRoomId) bleed = true;
    }

    // Leak: exponential decay of every gas.
    const k = leakRate(leak, V);
    const decay = Math.exp(-k * dt);
    pN2 *= decay;
    ppO2 *= decay; // CO2 in ppm is a mole fraction, so a leak does not change it

    // Breathing.
    ppO2 -= ((PHYS.O2_USE * people) / V) * dt;
    co2 += ((PHYS.CO2_GEN * people) / V) * dt;

    // O2 generator: tops back up to nominal, capped by capacity and health.
    if (hasGen && ctx.o2GenHealth > 0) {
      const max = ((PHYS.O2_USE * ctx.o2GenCapacityPeople) / V) * ctx.o2GenHealth * dt;
      ppO2 += Math.min(max, Math.max(0, PHYS.PPO2_NOMINAL - ppO2));
    }
    // Emergency O2 bleed from the reserve.
    if (bleed && home.o2ReservePct > 0) {
      ppO2 += PHYS.O2_BLEED_KPA_S * dt;
      home.o2ReservePct = Math.max(0, home.o2ReservePct - (100 / PHYS.O2_RESERVE_FULL_S) * dt);
    }
    // Scrubber: only in its own zone.
    if (hasScrub) co2 -= PHYS.SCRUBBER_RATE * ctx.scrubberHealth * Math.max(0, co2 - PHYS.CO2_BASELINE) * dt;

    // Repressurization after a patch, from reserve gas.
    if (home.repressurizing && leak === 0) {
      const p = pN2 + ppO2;
      if (p < NOMINAL_PRESSURE - 0.05) {
        const add = Math.min(PHYS.REPRESS_KPA_S * dt, NOMINAL_PRESSURE - p);
        pN2 += add * (PHYS.PN2_NOMINAL / NOMINAL_PRESSURE);
        ppO2 += add * (PHYS.PPO2_NOMINAL / NOMINAL_PRESSURE);
      }
    }

    // Fire, suppression, temperature.
    if (fire && !suppressed) {
      smoke = Math.min(100, smoke + 0.5 * dt);
      temp += 0.08 * dt;
      ppO2 -= 0.002 * dt;
    } else if (suppressed || home.scrubSmoke) {
      smoke *= Math.exp(-dt / 120);
      temp += (PHYS.TEMP_SET_C - temp) * (1 - Math.exp(-dt / 300));
    } else {
      smoke *= Math.exp(-dt / 1800);
      temp += (PHYS.TEMP_SET_C - temp) * (1 - Math.exp(-dt / PHYS.TEMP_TAU_S));
    }

    ppO2 = Math.max(0, ppO2);
    co2 = Math.max(0, co2);
    for (const r of rs) {
      r.pN2 = pN2;
      r.ppO2 = ppO2;
      r.co2 = co2;
      r.tempC = temp;
      r.smoke = smoke;
    }
  }
}

/** Time for ppO2 to fall from p0 to the threshold under pure exponential decay. */
export const analyticTtd = (p0: number, threshold: number, k: number) => Math.log(p0 / threshold) / k;
