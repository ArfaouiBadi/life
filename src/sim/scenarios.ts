import type { ScenarioRequest } from "@/api/contracts";
import { MARS_HOUR_S, SOL_S } from "@/lib/marsTime";
import type { Outbox } from "./outbox";
import { SPE_DECAY_S, SPE_HOLD_S, SPE_PEAK, SPE_RAMP_S } from "./physics/radiation";
import { heroCode, newId } from "./world/generateWorld";
import { FIRE_ROOM } from "./world/templates";
import { regionalDto } from "./dto";
import { isoAt } from "./detect/incidents";
import type { SimHome, SimRegionalEvent, World } from "./world/types";

export class ScenarioError extends Error {}

function homeFor(w: World, req: ScenarioRequest): SimHome {
  const h = req.homeId !== undefined ? w.homeById.get(req.homeId) : w.homeByCode.get(heroCode(w));
  if (!h) throw new ScenarioError("Choose a home for this scenario.");
  return h;
}

export function injectScenario(w: World, req: ScenarioRequest, ox: Outbox) {
  switch (req.kind) {
    case "BREACH": {
      const h = homeFor(w, req);
      const room =
        (req.roomId !== undefined && h.rooms.find((r) => r.id === req.roomId)) ||
        h.rooms.find((r) => r.code === (h.template === "FAMILY" ? "BED2" : "BED"))!;
      const cm2 = Math.min(5, Math.max(0.25, req.intensity ?? 1.5));
      room.leakAreaM2 += cm2 * 1e-4;
      return;
    }
    case "SCRUBBER_FAILURE": {
      const e = homeFor(w, req).equipment.find((x) => x.type === "CO2_SCRUBBER")!;
      e.healthPct = 0;
      e.status = "FAILED";
      return;
    }
    case "RECYCLER_FAILURE": {
      const e = homeFor(w, req).equipment.find((x) => x.type === "WATER_RECYCLER")!;
      e.healthPct = 0;
      e.status = "FAILED";
      return;
    }
    case "FIRE": {
      const h = homeFor(w, req);
      h.rooms.find((r) => r.code === FIRE_ROOM[h.template])!.fire = true;
      return;
    }
    case "GATEWAY_OFFLINE": {
      const h = homeFor(w, req);
      h.gatewayOfflineUntilTick = w.tick + (req.durationSec ?? 60);
      return;
    }
    case "UPLINK_LOST":
      w.uplinkDownUntilTick = w.tick + (req.durationSec ?? 30);
      return;
    case "DUST_STORM": {
      const s = w.settlements.find((x) => x.id === req.settlementId) ?? w.settlements.find((x) => x.code === "ARC")!;
      const tau = Math.min(6, Math.max(1, req.intensity ?? 4));
      const dur = req.durationSec ?? SOL_S;
      // Replaces any lighter dust event over the same settlement.
      w.regionalEvents = w.regionalEvents.filter((e) => !(e.kind === "DUST_STORM" && e.settlementIds.includes(s.id)));
      addRegional(w, ox, {
        kind: "DUST_STORM",
        settlementIds: [s.id],
        intensity: tau,
        baseIntensity: tau,
        expectedEndAt: isoAt(w, w.t + dur),
        rampUntil: w.t,
        holdUntil: w.t + dur,
        decayUntil: w.t + dur,
      });
      s.dustTau = tau;
      for (const h of w.homes) if (h.settlementId === s.id) h.batteryTtdAt = -Infinity;
      return;
    }
    case "SOLAR_PARTICLE_EVENT": {
      const ids = req.settlementId !== undefined ? [req.settlementId] : w.settlements.map((s) => s.id);
      const peak = req.intensity ?? SPE_PEAK;
      addRegional(w, ox, {
        kind: "SOLAR_PARTICLE_EVENT",
        settlementIds: ids,
        intensity: 1,
        baseIntensity: peak,
        expectedEndAt: isoAt(w, w.t + SPE_RAMP_S + SPE_HOLD_S + SPE_DECAY_S),
        rampUntil: w.t + SPE_RAMP_S,
        holdUntil: w.t + SPE_RAMP_S + SPE_HOLD_S,
        decayUntil: w.t + SPE_RAMP_S + SPE_HOLD_S + SPE_DECAY_S,
      });
      return;
    }
  }
}

export function addRegional(
  w: World,
  ox: Outbox,
  e: Omit<SimRegionalEvent, "id" | "code" | "startedAt" | "affectedHomes" | "homesNeedingAction">,
) {
  const id = newId(w, "regional");
  const ev: SimRegionalEvent = {
    ...e,
    id,
    code: `REG-${String(id).padStart(3, "0")}`,
    startedAt: isoAt(w),
    affectedHomes: w.homes.filter((h) => e.settlementIds.includes(h.settlementId)).length,
    homesNeedingAction: 0,
  };
  w.regionalEvents.push(ev);
  ox.regional.push(regionalDto(ev));
  return ev;
}

/** Moves the clock forward until a settlement's LMST equals the target; time never runs backward. */
export function secondsUntilLocalTime(currentLmst: number, targetLmst: number) {
  return (((targetLmst - currentLmst + 24) % 24) * MARS_HOUR_S);
}
