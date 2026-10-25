import { useMemo } from "react";
import type { HatchState, HomeDetail, Id, Prediction, Severity, TelemetrySnapshot } from "@/api/contracts";
import { HazardDefs, SEV_COLOR } from "@/components/hg/status";
import { useReducedMotion } from "@/lib/motion";
import { firstName } from "@/lib/format";

const PX = 44; // pixels per meter at scale 1

/**
 * The home's live floor plan: rooms by severity, hatches, people, and airflow toward a leak.
 * The arrows follow open hatches from every room in the leaking zone to the breached room;
 * when the hatch is sealed, the rest of the house drops out of the zone and its arrows stop.
 */
export function FloorPlan({
  home,
  live,
  predictions,
  onHatch,
  compact,
  highlightPersonId,
}: {
  home: HomeDetail;
  live: TelemetrySnapshot | undefined;
  predictions: Prediction[];
  onHatch?: (hatchId: Id, state: HatchState) => void;
  compact?: boolean;
  highlightPersonId?: Id;
}) {
  const reduced = useReducedMotion();
  const offline = home.link === "OFFLINE";
  const hatchState = new Map<Id, HatchState>((live?.hatches ?? home.hatches).map((h) => [h.id, h.state]));
  const reading = new Map((live?.rooms ?? []).map((r) => [r.roomId, r]));
  const roomById = new Map(home.rooms.map((r) => [r.id, r]));
  const W = home.widthM;
  const H = home.depthM;

  // Leak room: loudest ultrasonic sensor at or above 0.5.
  const leakRoomId = useMemo(() => {
    let best: Id | null = null;
    let a = 0.5;
    for (const r of live?.rooms ?? []) if (r.leakAcoustic >= a) [best, a] = [r.roomId, r.leakAcoustic];
    return best;
  }, [live]);

  // Flow paths: BFS from the leak room through OPEN hatches; each room flows to its parent's hatch.
  const flows = useMemo(() => {
    if (leakRoomId === null) return [];
    const out: { d: string; key: string }[] = [];
    const visited = new Set([leakRoomId]);
    const queue: Id[] = [leakRoomId];
    const center = (id: Id) => {
      const p = roomById.get(id)!.polygon;
      return [(p[0][0] + p[2][0]) / 2, (p[0][1] + p[2][1]) / 2];
    };
    while (queue.length) {
      const cur = queue.shift()!;
      for (const h of home.hatches) {
        if (hatchState.get(h.id) !== "OPEN" || h.roomBId === null) continue;
        const next = h.roomAId === cur ? h.roomBId : h.roomBId === cur ? h.roomAId : null;
        if (next === null || visited.has(next)) continue;
        visited.add(next);
        queue.push(next);
        const [sx, sy] = center(next);
        const [ex, ey] = cur === leakRoomId ? leakPoint(cur) : center(cur);
        out.push({ key: `${next}-${cur}`, d: `M${sx * PX},${sy * PX} L${h.x * PX},${h.y * PX} L${ex * PX},${ey * PX}` });
      }
    }
    return out;
    function leakPoint(id: Id) {
      const p = roomById.get(id)!.polygon;
      return [(p[0][0] + p[2][0]) / 2, p[0][1] + 0.5];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leakRoomId, live?.hatches, home]);

  const sealedEmpty = new Set(
    predictions.filter((p) => p.metric === "PPO2_KPA" && !p.occupied && p.trend === "FALLING" && p.zoneRoomIds.length === 1).map((p) => p.zoneRoomIds[0]),
  );
  const people = live?.occupants ?? [];

  return (
    <svg viewBox={`-20 -20 ${W * PX + 40} ${H * PX + 40}`} className="block h-full w-full" role="img" aria-label={`Floor plan of ${home.code}`}>
      <HazardDefs id="hazard-plan" />
      <defs>
        <marker id="flow-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10Z" fill="var(--color-critical)" />
        </marker>
      </defs>

      {home.rooms.map((room) => {
        const [x0, y0] = room.polygon[0];
        const [x1, y1] = room.polygon[2];
        const r = reading.get(room.id);
        const sev: Severity = r?.severity ?? "NOMINAL";
        const color = SEV_COLOR[sev];
        const fillOpacity = sev === "WARNING" ? 0.2 : sev === "CRITICAL" ? 0.3 : sev === "EMERGENCY" ? 0.9 : 0;
        const airlock = room.type === "AIRLOCK";
        return (
          <g key={room.id}>
            <rect
              x={x0 * PX}
              y={y0 * PX}
              width={(x1 - x0) * PX}
              height={(y1 - y0) * PX}
              fill={sev === "EMERGENCY" ? "url(#hazard-plan)" : sev === "NOMINAL" || sev === "ADVISORY" ? (airlock ? "#13223A" : "#172742") : color}
              fillOpacity={sev === "NOMINAL" || sev === "ADVISORY" ? 1 : fillOpacity}
              stroke={offline ? "var(--color-offline)" : "var(--color-glass)"}
              strokeOpacity={offline ? 1 : 0.85}
              strokeWidth={2}
              strokeDasharray={offline ? "8 6" : undefined}
            />
            {sev === "ADVISORY" && (
              <rect x={x0 * PX + 4} y={y0 * PX + 4} width={(x1 - x0) * PX - 8} height={(y1 - y0) * PX - 8} fill="none" stroke={color} strokeDasharray="2 4" strokeWidth={2} />
            )}
            {(sev === "CRITICAL" || sev === "EMERGENCY") && (
              <rect x={x0 * PX + 2} y={y0 * PX + 2} width={(x1 - x0) * PX - 4} height={(y1 - y0) * PX - 4} fill="none" stroke={color} strokeWidth={3} className="alarm-pulse" />
            )}
            <text x={x0 * PX + 8} y={y0 * PX + 20} fontSize={compact ? 15 : 13} fontWeight={560} fill="var(--color-glass)">
              {room.name}
            </text>
            {!compact && r && room.type !== "CORRIDOR" && (
              <text x={x0 * PX + 8} y={y0 * PX + 37} fontSize={11.5} fill="var(--color-mist)" className="tabular">
                O₂ {r.ppO2KPa.toFixed(1)}, CO₂ {Math.round(r.co2Ppm)}
              </text>
            )}
            {sealedEmpty.has(room.id) && (
              <text x={((x0 + x1) / 2) * PX} y={((y0 + y1) / 2) * PX + 8} textAnchor="middle" fontSize={13} fontWeight={650} fill="var(--color-glass)">
                Sealed and empty
              </text>
            )}
          </g>
        );
      })}

      {/* Airflow toward the leak */}
      {flows.map((f) => (
        <path
          key={f.key}
          d={f.d}
          fill="none"
          stroke="var(--color-critical)"
          strokeWidth={2.4}
          strokeDasharray="6 7"
          strokeLinejoin="round"
          markerEnd="url(#flow-head)"
          className={reduced ? "" : "flow-dash"}
          opacity={0.9}
        />
      ))}
      {leakRoomId !== null && <LeakMark room={roomById.get(leakRoomId)!.polygon} />}

      {/* Hatches */}
      {home.hatches.map((h) => {
        const state = hatchState.get(h.id) ?? h.state;
        const len = h.widthM * PX;
        const horizontal = h.orientation === "H";
        const x = h.x * PX - (horizontal ? len / 2 : 4);
        const y = h.y * PX - (horizontal ? 4 : len / 2);
        const w = horizontal ? len : 8;
        const hh = horizontal ? 8 : len;
        const sealed = state === "SEALED";
        const roomA = roomById.get(h.roomAId)?.name ?? "";
        const roomB = h.roomBId ? roomById.get(h.roomBId)?.name : "outside";
        const interactive = !!onHatch && h.roomBId !== null;
        return (
          <g
            key={h.id}
            role={interactive ? "button" : undefined}
            tabIndex={interactive ? 0 : undefined}
            aria-label={`Hatch between ${roomA} and ${roomB}, ${sealed ? "sealed" : "open"}`}
            className={interactive ? "cursor-pointer outline-none [&:focus-visible>rect:last-child]:stroke-glass" : undefined}
            onClick={() => interactive && onHatch!(h.id, sealed ? "OPEN" : "SEALED")}
            onKeyDown={(e) => interactive && e.key === "Enter" && onHatch!(h.id, sealed ? "OPEN" : "SEALED")}
          >
            <rect x={x - 2} y={y - 2} width={w + 4} height={hh + 4} fill="#0F1B2D" />
            <rect
              x={x}
              y={y}
              width={w}
              height={hh}
              rx={2}
              fill={sealed ? "var(--color-glass)" : "none"}
              stroke="var(--color-glass)"
              strokeOpacity={sealed ? 1 : 0.45}
              strokeDasharray={sealed ? undefined : "3 3"}
              style={{ transition: "fill 240ms var(--ease-emphasized)" }}
            />
          </g>
        );
      })}

      {/* People */}
      {people.map((p) => {
        const o = home.occupants.find((x) => x.id === p.id);
        if (!o) return null;
        const hl = highlightPersonId === o.id;
        return (
          <g
            key={p.id}
            style={{ transform: `translate(${p.x * PX}px, ${p.y * PX}px)`, transition: reduced ? undefined : "transform 1s linear" }}
            role="img"
            aria-label={`${o.name}${o.roomId !== null ? `, in ${roomById.get(p.roomId ?? -1)?.name ?? "the home"}` : ""}`}
          >
            {hl && <circle r={20} fill="none" stroke="var(--color-glass)" strokeWidth={2} className="alarm-pulse" />}
            <circle r={13} fill={hl ? "var(--color-glass)" : "#DCEFF5"} stroke="#0F1B2D" strokeWidth={2} />
            <text textAnchor="middle" dy={4} fontSize={10.5} fontWeight={650} fill="#0F1B2D">
              {o.initials}
            </text>
            {!compact && (
              <text textAnchor="middle" y={27} fontSize={11} fill="var(--color-glass)">
                {firstName(o.name)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function LeakMark({ room }: { room: [number, number][] }) {
  const cx = ((room[0][0] + room[2][0]) / 2) * PX;
  const cy = room[0][1] * PX;
  return (
    <g transform={`translate(${cx},${cy})`} aria-label="Leak location">
      <circle r={9} fill="var(--color-critical)" className="alarm-pulse" />
      <path d="M-5,-5 L5,5 M5,-5 L-5,5" stroke="#0F1B2D" strokeWidth={2.4} strokeLinecap="round" />
    </g>
  );
}
