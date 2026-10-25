import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { useQueries } from "@tanstack/react-query";
import { select, zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from "d3";
import { api } from "@/api";
import type { Dome, HomeSummary, MapFeature, Severity } from "@/api/contracts";
import { sevRank } from "@/api/contracts";
import { useDomes, useFeatures, useSettlement } from "@/hooks/data";
import { HEX_NEIGHBORS, hexCorners, hexSizeForDome, hexToPixel } from "@/lib/hex";
import { polyPoints, pointAlong } from "@/lib/geometry";
import { easeEmphasized, prefersReducedMotion } from "@/lib/motion";
import { formatMarsHours, lmstAt } from "@/lib/marsTime";
import { num, plural, SEVERITY_PLURAL, formatTtd } from "@/lib/format";
import { useFleetStore } from "@/stores/fleetStore";
import { useIncidentStore } from "@/stores/incidentStore";
import { useUiStore } from "@/stores/uiStore";
import { HazardDefs, SEV_COLOR, StatusGlyph } from "@/components/hg/status";
import { Loading, ErrorLine } from "@/components/hg/Loading";
import { HomeTile } from "./HomeTile";
import { terrainFor } from "./terrain";
import { Minimap } from "./Minimap";

type Lod = "far" | "near";

export default function SettlementPage() {
  const { settlementCode = "", domeCode } = useParams();
  const { data: settlement, error } = useSettlement(settlementCode.toUpperCase());
  const { data: domes } = useDomes(settlement?.id);
  const { data: features } = useFeatures(settlement?.id);
  const homeQueries = useQueries({
    queries: (domes ?? []).map((d) => ({ queryKey: ["homes", d.id], queryFn: () => api.listHomes(d.id), staleTime: Infinity })),
  });
  const homesByDome = useMemo(() => {
    const m = new Map<number, HomeSummary[]>();
    (domes ?? []).forEach((d, i) => {
      const h = homeQueries[i]?.data;
      if (h) m.set(d.id, h);
    });
    return m;
  }, [domes, homeQueries]);

  const setFocus = useUiStore((s) => s.setFocusSettlement);
  useEffect(() => {
    setFocus(settlementCode.toUpperCase());
  }, [settlementCode, setFocus]);

  if (error) return <ErrorLine error={error} />;
  if (!settlement || !domes || !features) return <Loading label="Flying down" />;
  return (
    <SettlementMap
      key={settlement.code}
      settlement={settlement}
      domes={domes}
      features={features}
      homesByDome={homesByDome}
      domeCode={domeCode?.toUpperCase()}
    />
  );
}

function SettlementMap({
  settlement,
  domes,
  features,
  homesByDome,
  domeCode,
}: {
  settlement: NonNullable<ReturnType<typeof useSettlement>["data"]>;
  domes: Dome[];
  features: MapFeature[];
  homesByDome: Map<number, HomeSummary[]>;
  domeCode: string | undefined;
}) {
  const navigate = useNavigate();
  const loc = useLocation();
  const navState = loc.state as { fromPlanet?: boolean; descend?: string[] } | null;
  const wrap = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const transformRef = useRef<ZoomTransform>(zoomIdentity);
  const anchors = useRef(new Map<string, { el: HTMLElement; x: number; y: number }>());
  const tileEls = useRef(new Map<string, SVGGElement>());
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [lod, setLod] = useState<Lod>("far");
  const [viewport, setViewport] = useState<ZoomTransform>(zoomIdentity);
  const terrain = useMemo(() => terrainFor(settlement.code), [settlement.code]);
  const W = settlement.frameWidthM;
  const H = settlement.frameHeightM;
  const focusDome = domes.find((d) => d.code === domeCode);
  const reduced = prefersReducedMotion();

  const fitK = size.w ? Math.min(size.w / W, size.h / H) * 0.94 : 0.2;
  const transformFor = useCallback(
    (cx: number, cy: number, k: number) => zoomIdentity.translate(size.w / 2 - cx * k, size.h / 2 - cy * k).scale(k),
    [size],
  );
  const domeK = useCallback((d: Dome) => Math.min(size.w, size.h) / (d.radiusM * 2.5), [size]);

  const placeAnchors = useCallback(() => {
    const t = transformRef.current;
    for (const a of anchors.current.values()) a.el.style.transform = `translate(${a.x * t.k + t.x}px, ${a.y * t.k + t.y}px)`;
  }, []);

  // Size + zoom behavior.
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(wrap.current!);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!size.w) return;
    const svg = select(svgRef.current!);
    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([fitK * 0.1, fitK * 60])
      .on("zoom", (e) => {
        const t = e.transform as ZoomTransform;
        transformRef.current = t;
        gRef.current?.setAttribute("transform", t.toString());
        placeAnchors();
        setLod(t.k / fitK > 2.6 ? "near" : "far");
        setViewport(t);
      });
    zoomRef.current = z;
    svg.call(z).on("dblclick.zoom", null);
    return () => void svg.on(".zoom", null);
  }, [size.w, size.h, fitK, placeAnchors]);

  const fly = useCallback(
    (t: ZoomTransform, dur = 1200) =>
      new Promise<void>((resolve) => {
        const svg = select(svgRef.current!);
        svg
          .transition()
          .duration(reduced ? 150 : dur)
          .ease(easeEmphasized)
          .call(zoomRef.current!.transform, t)
          .on("end interrupt", () => resolve());
      }),
    [reduced],
  );

  // Camera: entering from the planet starts far out; a dome in the URL focuses that dome.
  const first = useRef(true);
  useEffect(() => {
    if (!size.w || !zoomRef.current) return;
    const svg = select(svgRef.current!);
    const target = focusDome ? transformFor(focusDome.centerX, focusDome.centerY, domeK(focusDome)) : transformFor(W / 2, H / 2, fitK);
    if (first.current) {
      first.current = false;
      if (navState?.fromPlanet && !reduced) {
        svg.call(zoomRef.current.transform, transformFor(W / 2, H / 2, fitK * 0.12));
        void fly(target, 1300).then(() => descendNext());
      } else svg.call(zoomRef.current.transform, target);
      return;
    }
    void fly(target).then(() => descendNext());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h, focusDome?.id]);

  // Demo descent: continue to the next code in the chain (dome, then home).
  const descendNext = () => {
    const next = navState?.descend?.[0];
    if (!next) return;
    const rest = navState.descend!.slice(1);
    const dome = domes.find((d) => d.code === next);
    if (dome) setTimeout(() => navigate(`/ops/map/${settlement.code}/${dome.code}`, { state: { descend: rest } }), 500);
    else {
      const home = [...homesByDome.values()].flat().find((h) => h.code === next);
      if (home) setTimeout(() => openHome(home), 700);
    }
  };

  const openHome = (h: HomeSummary) => {
    const d = domes.find((x) => x.id === h.domeId)!;
    const s = hexSizeForDome(d.radiusM, d.homeCount);
    const [x, y] = hexToPixel({ q: h.hexQ, r: h.hexR }, s);
    void fly(transformFor(d.centerX + x, d.centerY + y, Math.min(size.w, size.h) / (s * 5)), 900).then(() => navigate(`/ops/homes/${h.code}`));
  };

  const onTileKey = (h: HomeSummary, e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openHome(h);
      return;
    }
    const dir = { ArrowRight: 0, ArrowUp: 1, ArrowLeft: 3, ArrowDown: 5 }[e.key];
    if (dir === undefined) return;
    e.preventDefault();
    const list = homesByDome.get(h.domeId) ?? [];
    const n = HEX_NEIGHBORS[dir];
    const target = list.find((x) => x.hexQ === h.hexQ + n.q && x.hexR === h.hexR + n.r) ?? (dir === 1 || dir === 5 ? list.find((x) => x.hexQ === h.hexQ + (dir === 1 ? 1 : -1) && x.hexR === h.hexR + (dir === 1 ? -1 : 1)) : undefined);
    if (target) tileEls.current.get(target.code)?.focus();
  };

  const registerTile = useCallback((code: string, el: SVGGElement | null) => {
    if (el) tileEls.current.set(code, el);
    else tileEls.current.delete(code);
  }, []);

  const registerAnchor = (key: string, x: number, y: number) => (el: HTMLElement | null) => {
    if (el) {
      anchors.current.set(key, { el, x, y });
      const t = transformRef.current;
      el.style.transform = `translate(${x * t.k + t.x}px, ${y * t.k + t.y}px)`;
    } else anchors.current.delete(key);
  };

  const status = useFleetStore((s) => s.status);
  const now = useFleetStore((s) => s.simTimeMs);
  const dispatches = useIncidentStore((s) => s.dispatches);
  const regional = useIncidentStore((s) => s.regional);
  const dust = Object.values(regional).find((e) => e.kind === "DUST_STORM" && e.settlementIds.includes(settlement.id));
  const solarStorm = Object.values(regional).find((e) => e.kind === "SOLAR_PARTICLE_EVENT" && e.settlementIds.includes(settlement.id));
  const myDispatches = Object.values(dispatches).filter((d) => d.settlementId === settlement.id && d.status !== "DONE");

  // Loud homes get a callout at settlement zoom, so the one problem among hundreds can't be missed.
  const loudHomes = useMemo(() => {
    const out: { home: HomeSummary; dome: Dome; sev: Severity; ttd: number | null; x: number; y: number }[] = [];
    for (const d of domes) {
      const s = hexSizeForDome(d.radiusM, d.homeCount);
      for (const h of homesByDome.get(d.id) ?? []) {
        const live = status[h.id];
        const sev = live?.severity ?? h.severity;
        if (sevRank(sev) < sevRank("WARNING")) continue;
        const [x, y] = hexToPixel({ q: h.hexQ, r: h.hexR }, s);
        out.push({ home: h, dome: d, sev, ttd: live?.ttdSeconds ?? null, x: d.centerX + x, y: d.centerY + y });
      }
    }
    return out.sort((a, b) => sevRank(b.sev) - sevRank(a.sev));
  }, [domes, homesByDome, status]);

  const people = domes.reduce((a, d) => a + d.residentCount, 0);
  const homeCount = domes.reduce((a, d) => a + d.homeCount, 0);

  return (
    <div ref={wrap} className="absolute inset-0 overflow-hidden">
      <svg ref={svgRef} width="100%" height="100%" className="block touch-none select-none" role="application" aria-label={`Map of ${settlement.name}`}>
        <HazardDefs />
        <defs>
          <filter id="dust-noise" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.0035 0.006" numOctaves="3" seed="4" />
            <feColorMatrix values="0 0 0 0 0.79  0 0 0 0 0.55  0 0 0 0 0.31  0 0 0 1.3 -0.35" />
          </filter>
          <radialGradient id="dome-glass" cx="35%" cy="30%">
            <stop offset="0%" stopColor="#DCEFF5" stopOpacity="0.09" />
            <stop offset="100%" stopColor="#DCEFF5" stopOpacity="0.02" />
          </radialGradient>
        </defs>
        <g ref={gRef}>
          <rect x={-W} y={-H} width={W * 3} height={H * 3} fill="#0F1B2D" />
          {/* Terrain: regolith contours, scenery only */}
          <g fill="none" stroke="var(--color-regolith)" vectorEffect="non-scaling-stroke">
            {terrain.paths.map((p, i) => (
              <path key={i} d={p.d} strokeOpacity={p.major ? 0.5 : 0.22} strokeWidth={p.major ? 1.1 : 0.6} vectorEffect="non-scaling-stroke" />
            ))}
          </g>
          <rect x={0} y={0} width={W} height={H} fill="none" stroke="var(--color-hairline)" strokeDasharray="6 6" vectorEffect="non-scaling-stroke" />

          {/* Infrastructure */}
          {features.map((f) => (
            <FeatureShape key={f.id} f={f} />
          ))}

          {/* Domes */}
          {domes.map((d) => {
            const s = hexSizeForDome(d.radiusM, d.homeCount);
            return (
              <g key={d.id}>
                <circle cx={d.centerX} cy={d.centerY} r={d.radiusM} fill="url(#dome-glass)" stroke="var(--color-glass)" strokeOpacity={0.75} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
                <circle cx={d.centerX} cy={d.centerY} r={d.radiusM * 0.97} fill="none" stroke="var(--color-glass)" strokeOpacity={0.18} vectorEffect="non-scaling-stroke" />
                <polygon points={polyPoints(hexCorners(d.centerX, d.centerY, s * 0.8))} fill="var(--color-mist)" fillOpacity={0.35} aria-hidden />
                <g
                  role="button"
                  tabIndex={0}
                  aria-label={`${d.name} dome, ${plural(d.homeCount, "home", "homes")}, ${plural(d.residentCount, "resident", "residents")}`}
                  className="outline-none"
                  onClick={() => navigate(`/ops/map/${settlement.code}/${d.code}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") navigate(`/ops/map/${settlement.code}/${d.code}`);
                    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
                      e.preventDefault();
                      const firstHome = homesByDome.get(d.id)?.[0];
                      if (firstHome) tileEls.current.get(firstHome.code)?.focus();
                    }
                  }}
                >
                  <circle cx={d.centerX} cy={d.centerY} r={d.radiusM} fill="transparent" className="[g:focus-visible>&]:stroke-glass" strokeWidth={3} vectorEffect="non-scaling-stroke" />
                </g>
                {(homesByDome.get(d.id) ?? []).map((h) => {
                  const [x, y] = hexToPixel({ q: h.hexQ, r: h.hexR }, s);
                  return (
                    <HomeTile key={h.id} home={h} cx={d.centerX + x} cy={d.centerY + y} size={s} detail={lod} onOpen={openHome} onKey={onTileKey} registerRef={registerTile} />
                  );
                })}
              </g>
            );
          })}

          {/* Dust: procedural noise over the whole frame */}
          {dust && (
            <g pointerEvents="none" style={{ opacity: Math.min(0.75, (dust.intensity - 0.5) * 0.16) }}>
              <rect x={-400} y={-300} width={W + 800} height={H + 600} filter="url(#dust-noise)" className={reduced ? "" : "dust-drift"} />
            </g>
          )}

          {/* Rovers */}
          {myDispatches.map((d) => {
            const p = pointAlong(d.path, d.progress);
            return (
              <g key={d.id} pointerEvents="none">
                <polyline points={polyPoints(d.path)} fill="none" stroke="var(--color-glass)" strokeOpacity={0.7} strokeDasharray="6 5" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
                <g transform={`translate(${p.x},${p.y}) rotate(${p.angle})`}>
                  <rect x={-14} y={-8} width={28} height={16} rx={4} fill="var(--color-glass)" />
                  <path d="M6,-4 L12,0 L6,4Z" fill="#0F1B2D" />
                </g>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Screen-space labels (stay readable at any zoom) */}
      <div className="pointer-events-none absolute inset-0">
        {terrain.labels.map((l) => (
          <span key={l.name} ref={registerAnchor(`t-${l.name}`, l.x, l.y)} className="absolute left-0 top-0 whitespace-nowrap">
            <span className="serif-feature block -translate-x-1/2 text-[14px] text-regolith" style={{ transform: `translateX(-50%) rotate(${l.angle ?? 0}deg)` }}>
              {l.name}
            </span>
          </span>
        ))}
        {features
          .filter((f) => f.kind !== "TUNNEL" && f.kind !== "ROAD")
          .map((f) => {
            const cx = f.points.reduce((a, p) => a + p[0], 0) / f.points.length;
            const maxY = Math.max(...f.points.map((p) => p[1]));
            return (
              <span key={f.id} ref={registerAnchor(`f-${f.id}`, cx, maxY)} className="absolute left-0 top-0">
                <span className="mt-1 block -translate-x-1/2 whitespace-nowrap text-xs text-mist">{f.name}</span>
              </span>
            );
          })}
        {domes.map((d) => (
          <span
            key={d.id}
            ref={registerAnchor(`d-${d.id}`, d.centerX, d.centerY - d.radiusM)}
            className="absolute left-0 top-0 transition-opacity"
            style={{ opacity: lod === "near" && focusDome && focusDome.id !== d.id ? 0.4 : 1 }}
          >
            <span className="block -translate-x-1/2 -translate-y-[calc(100%+6px)] whitespace-nowrap text-center leading-tight [text-shadow:0_1px_6px_#0F1B2D]">
              <span className="w-expanded block text-[15px] font-[650] text-glass">{d.name}</span>
              <DomeCounts d={d} />
            </span>
          </span>
        ))}
        {lod === "far" &&
          loudHomes.slice(0, 6).map((l) => (
            <span key={l.home.id} ref={registerAnchor(`h-${l.home.id}`, l.x, l.y)} className="absolute left-0 top-0">
              <span
                className="ml-3 -mt-3 flex items-center gap-1.5 whitespace-nowrap rounded-instrument border bg-dusk px-2 py-1 shadow-[0_6px_18px_rgba(0,0,0,.4)]"
                style={{ borderColor: SEV_COLOR[l.sev] }}
              >
                <StatusGlyph severity={l.sev} size={13} />
                <span className="w-condensed tabular font-[560]">{l.home.code}</span>
                {l.ttd !== null && (
                  <span className="tabular" style={{ color: SEV_COLOR[l.sev] }}>
                    {formatTtd(l.ttd)}
                  </span>
                )}
              </span>
            </span>
          ))}
        {myDispatches.map((d) => {
          const p = pointAlong(d.path, d.progress);
          return (
            <span key={`r-${d.id}`} ref={registerAnchor(`r-${d.id}`, p.x, p.y)} className="absolute left-0 top-0">
              <span className="ml-4 block whitespace-nowrap rounded-instrument bg-dusk/90 px-1.5 py-0.5 text-xs">
                <span className="font-[560]">{d.roverCode}</span>{" "}
                <span className="text-mist">{d.status === "ON_SITE" ? "on site" : `${Math.max(1, Math.round(d.etaSeconds / 60))} min`}</span>
              </span>
            </span>
          );
        })}
      </div>

      {/* Header set directly on the map */}
      <div className="pointer-events-none absolute left-6 top-5 max-w-[60%]">
        <button type="button" className="pointer-events-auto text-mist hover:text-glass hover:underline underline-offset-4" onClick={() => navigate("/ops/map")}>
          Mars
        </button>
        {focusDome && (
          <>
            <span className="text-mist"> / </span>
            <button type="button" className="pointer-events-auto text-mist hover:text-glass hover:underline underline-offset-4" onClick={() => navigate(`/ops/map/${settlement.code}`)}>
              {settlement.name}
            </button>
          </>
        )}
        <h1 className="w-expanded mt-1 text-[36px] font-[650] leading-[1.1]">{focusDome ? `${focusDome.name} dome` : settlement.name}</h1>
        <p className="serif-feature mt-0.5 text-[18px] text-mist">{settlement.featureName}</p>
        <p className="mt-2 tabular text-mist">
          {focusDome
            ? `${plural(focusDome.homeCount, "home", "homes")}, ${plural(focusDome.residentCount, "person", "people")}`
            : `${plural(domes.length, "dome", "domes")}, ${num(homeCount)} homes, ${num(people)} people`}
          {now !== null && <>, local time {formatMarsHours(lmstAt(now, settlement.lon))}</>}
        </p>
        {dust && (
          <p className="mt-1 flex items-center gap-1.5 text-mist">
            <StatusGlyph severity={dust.intensity < 2 ? "ADVISORY" : "WARNING"} size={13} />
            {dust.intensity < 2 ? "Light dust" : "Dust storm"}, optical depth {dust.intensity.toFixed(1)}
          </p>
        )}
        {solarStorm && (
          <p className="mt-1 flex items-center gap-1.5 text-mist">
            <StatusGlyph severity="WARNING" size={13} />
            Solar storm, radiation ×{solarStorm.intensity.toFixed(0)}
          </p>
        )}
      </div>

      <Minimap
        width={W}
        height={H}
        domes={domes}
        crater={terrain.crater}
        transform={viewport}
        view={size}
        onJump={(x, y) => void fly(transformFor(x, y, transformRef.current.k), 600)}
      />
    </div>
  );
}

function DomeCounts({ d }: { d: Dome }) {
  const loud = (["EMERGENCY", "CRITICAL", "WARNING"] as Severity[]).filter((s) => d.severityCounts[s] > 0);
  return (
    <span className="flex items-center justify-center gap-2 text-xs text-mist tabular">
      {loud.length === 0 && d.offlineCount === 0 && <span>{plural(d.homeCount, "home", "homes")}</span>}
      {loud.map((s) => (
        <span key={s} className="inline-flex items-center gap-1" style={{ color: SEV_COLOR[s] }}>
          <StatusGlyph severity={s} size={11} />
          {d.severityCounts[s]} {SEVERITY_PLURAL[s][d.severityCounts[s] === 1 ? 0 : 1]}
        </span>
      ))}
      {d.offlineCount > 0 && (
        <span className="inline-flex items-center gap-1">
          <StatusGlyph severity="NOMINAL" link="OFFLINE" size={11} />
          {d.offlineCount} offline
        </span>
      )}
    </span>
  );
}

function FeatureShape({ f }: { f: MapFeature }) {
  const ns = { vectorEffect: "non-scaling-stroke" as const };
  switch (f.kind) {
    case "TUNNEL":
      return (
        <g>
          <polyline points={polyPoints(f.points)} fill="none" stroke="var(--color-glass)" strokeOpacity={0.5} strokeWidth={5} {...ns} />
          <polyline points={polyPoints(f.points)} fill="none" stroke="#0F1B2D" strokeWidth={2.6} {...ns} />
        </g>
      );
    case "ROAD":
      return <polyline points={polyPoints(f.points)} fill="none" stroke="var(--color-mist)" strokeOpacity={0.6} strokeDasharray="4 6" strokeWidth={1.2} {...ns} />;
    case "SOLAR_FARM": {
      const [x0, y0] = f.points[0];
      const [x1, y1] = f.points[2];
      const panels: [number, number][] = [];
      for (let y = y0 + 10; y < y1 - 10; y += 26) for (let x = x0 + 10; x < x1 - 10; x += 40) panels.push([x, y]);
      return (
        <g fill="var(--color-glass)" fillOpacity={0.08} stroke="var(--color-glass)" strokeOpacity={0.4} strokeWidth={0.6}>
          {panels.map(([x, y]) => (
            <rect key={`${x}-${y}`} x={x} y={y} width={32} height={16} {...ns} />
          ))}
        </g>
      );
    }
    case "LANDING_PAD": {
      const cx = (f.points[0][0] + f.points[2][0]) / 2;
      const cy = (f.points[0][1] + f.points[2][1]) / 2;
      const r = (f.points[2][0] - f.points[0][0]) / 2;
      return (
        <g fill="none" stroke="var(--color-glass)" strokeOpacity={0.55} {...ns}>
          <circle cx={cx} cy={cy} r={r} strokeWidth={1.2} {...ns} />
          <circle cx={cx} cy={cy} r={r * 0.6} strokeDasharray="5 5" {...ns} />
          <path d={`M${cx - r * 0.25},${cy - r * 0.3}v${r * 0.6}M${cx + r * 0.25},${cy - r * 0.3}v${r * 0.6}M${cx - r * 0.25},${cy}h${r * 0.5}`} strokeWidth={1.5} {...ns} />
        </g>
      );
    }
    case "ICE_PLANT":
      return (
        <polygon
          points={polyPoints(hexCorners((f.points[0][0] + f.points[2][0]) / 2, (f.points[0][1] + f.points[2][1]) / 2, (f.points[2][0] - f.points[0][0]) / 2))}
          fill="var(--color-glass)"
          fillOpacity={0.08}
          stroke="var(--color-glass)"
          strokeOpacity={0.55}
          {...ns}
        />
      );
  }
}
