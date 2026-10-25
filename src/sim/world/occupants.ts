import type { Id, RoomType } from "@/api/contracts";
import { isNight } from "@/lib/marsTime";
import { range, weighted, type Rng } from "../rng";
import type { SimHome, SimOccupant, SimRoom } from "./types";

const WALK_M_S = 1;
const DAY_WEIGHTS: Partial<Record<RoomType, number>> = { LIVING: 35, KITCHEN: 20, BEDROOM: 25 };

/** Shortest room path through OPEN hatches (BFS), as hatch waypoints. Airlocks and the outside are skipped. */
export function route(home: SimHome, fromId: Id, toId: Id): { x: number; y: number; roomId: Id }[] | null {
  if (fromId === toId) return [];
  const prev = new Map<Id, { from: Id; x: number; y: number }>();
  const queue = [fromId];
  const seen = new Set([fromId]);
  while (queue.length) {
    const cur = queue.shift()!;
    for (const h of home.hatches) {
      if (h.state !== "OPEN" || h.roomBId === null) continue;
      const next = h.roomAId === cur ? h.roomBId : h.roomBId === cur ? h.roomAId : null;
      if (next === null || seen.has(next)) continue;
      seen.add(next);
      prev.set(next, { from: cur, x: h.x, y: h.y });
      if (next === toId) {
        const path: { x: number; y: number; roomId: Id }[] = [];
        for (let n: Id = toId; n !== fromId; n = prev.get(n)!.from) path.unshift({ x: prev.get(n)!.x, y: prev.get(n)!.y, roomId: n });
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

function pointIn(rng: Rng, r: SimRoom): [number, number] {
  const inset = Math.min(0.7, r.w / 4, r.h / 4);
  return [range(rng, r.x + inset, r.x + r.w - inset), range(rng, r.y + inset, r.y + r.h - inset)];
}

function sendTo(home: SimHome, o: SimOccupant, target: SimRoom, rng: Rng) {
  if (o.roomId === null) return;
  const hops = route(home, o.roomId, target.id);
  if (!hops) return; // sealed off: stay put
  const [x, y] = pointIn(rng, target);
  o.path = [...hops.map((h) => [h.x, h.y, h.roomId] as [number, number, Id]), [x, y, target.id]];
}

export function stepOccupants(home: SimHome, dt: number, t: number, lmst: number, rng: Rng) {
  const night = isNight(lmst);
  const room = (id: Id) => home.rooms.find((r) => r.id === id)!;
  for (const o of home.occupants) {
    if (o.path.length) {
      let budget = WALK_M_S * dt;
      while (budget > 0 && o.path.length) {
        const [tx, ty, rid] = o.path[0];
        const d = Math.hypot(tx - o.x, ty - o.y);
        if (d <= budget) {
          o.x = tx;
          o.y = ty;
          o.roomId = rid;
          o.path.shift();
          budget -= d;
        } else {
          o.x += ((tx - o.x) / d) * budget;
          o.y += ((ty - o.y) / d) * budget;
          budget = 0;
        }
      }
      continue;
    }
    const goal = o.override ?? (night ? o.bedRoomId : null);
    if (goal !== null) {
      if (o.roomId !== goal) sendTo(home, o, room(goal), rng);
      continue;
    }
    if (t >= o.nextMoveAt) {
      o.nextMoveAt = t + range(rng, 300, 2400);
      const options = home.rooms.filter((r) => r.type !== "AIRLOCK" && r.type !== "CORRIDOR");
      const target = weighted(
        rng,
        options.map((r) => ({ item: r, w: DAY_WEIGHTS[r.type] ?? 20 / Math.max(1, options.filter((x) => !DAY_WEIGHTS[x.type]).length) })),
      );
      if (target.id !== o.roomId) sendTo(home, o, target, rng);
    }
  }
}

/** Snap everyone into bed (used when the clock jumps into the night). */
export function sendToBed(home: SimHome, rng: Rng) {
  for (const o of home.occupants) {
    if (o.override !== null) continue;
    const bed = home.rooms.find((r) => r.id === o.bedRoomId)!;
    const [x, y] = pointIn(rng, bed);
    Object.assign(o, { roomId: bed.id, x, y, path: [] });
  }
}
