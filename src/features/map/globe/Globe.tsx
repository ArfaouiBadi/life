import { useEffect, useRef } from "react";
import { geoCircle, geoDistance, geoGraticule10, geoOrthographic, geoPath, interpolate, select, drag } from "d3";
import type { Settlement, Severity } from "@/api/contracts";
import { sevRank } from "@/api/contracts";
import { marsTime } from "@/lib/marsTime";
import { easeEmphasized, prefersReducedMotion } from "@/lib/motion";
import { useFleetStore } from "@/stores/fleetStore";
import { NATURE_LABELS, marsContours } from "./terrain";
import { SettlementMarker } from "./SettlementMarker";

const AUTO_DEG_S = 2.2;

export interface GlobeHandle {
  flyTo: (code: string) => void;
}

/**
 * Mars as a survey chart, drawn on canvas with d3-geo (orthographic). Night side is shaded from the
 * real subsolar longitude, so you can see which settlements are asleep. Markers are DOM buttons.
 */
export function Globe({
  settlements,
  intro,
  dim,
  interactive = true,
  onArrive,
  flyRef,
}: {
  settlements: Settlement[];
  intro?: boolean;
  dim?: boolean;
  interactive?: boolean;
  onArrive?: (code: string) => void;
  flyRef?: React.MutableRefObject<GlobeHandle | null>;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const markerEls = useRef(new Map<string, HTMLElement>());
  const state = useRef({
    rotate: [-60, -18] as [number, number],
    scale: 1,
    opacity: 1,
    dragging: false,
    flying: false,
    lastFrame: 0,
    sunLon: 0,
  });
  const settlementsRef = useRef(settlements);
  settlementsRef.current = settlements;
  const onArriveRef = useRef(onArrive);
  onArriveRef.current = onArrive;

  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext("2d")!;
    const contourLevels = marsContours();
    const graticule = geoGraticule10();
    const reduced = prefersReducedMotion();
    let raf = 0;
    let w = 0, h = 0, dpr = 1;

    const resize = () => {
      const r = wrap.current!.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = r.width;
      h = r.height;
      el.width = w * dpr;
      el.height = h * dpr;
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
    };
    resize();
    const ro = new ResizeObserver(() => {
      resize();
      draw();
    });
    ro.observe(wrap.current!);

    const projection = geoOrthographic().clipAngle(90).precision(0.6);
    const path = geoPath(projection, ctx);

    function draw() {
      const s = state.current;
      const radius = Math.min(w, h) * 0.36 * s.scale;
      projection.rotate(s.rotate).scale(radius).translate([w / 2, h / 2]);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = s.opacity * (dim ? 0.55 : 1);

      // Sphere
      const g = ctx.createRadialGradient(w / 2 - radius * 0.35, h / 2 - radius * 0.4, radius * 0.1, w / 2, h / 2, radius);
      g.addColorStop(0, "#1B2E4B");
      g.addColorStop(1, "#122036");
      ctx.beginPath();
      path({ type: "Sphere" });
      ctx.fillStyle = g;
      ctx.fill();

      // Graticule
      ctx.beginPath();
      path(graticule);
      ctx.strokeStyle = "rgba(44,67,102,0.55)";
      ctx.lineWidth = 0.6;
      ctx.stroke();

      // Contours (regolith: scenery only)
      for (const c of contourLevels) {
        ctx.beginPath();
        path(c.geometry);
        ctx.strokeStyle = c.major ? "rgba(201,139,78,0.62)" : "rgba(201,139,78,0.3)";
        ctx.lineWidth = c.major ? 1.05 : 0.65;
        ctx.stroke();
      }

      // Night side
      const antisolar: [number, number] = [s.sunLon + 180, 0];
      ctx.beginPath();
      path(geoCircle().center(antisolar).radius(90)());
      ctx.fillStyle = "rgba(9,16,28,0.42)";
      ctx.fill();

      // Rim
      ctx.beginPath();
      path({ type: "Sphere" });
      ctx.strokeStyle = "rgba(220,239,245,0.35)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Nature labels: italic serif, the cartographic convention for natural features.
      const center: [number, number] = [-s.rotate[0], -s.rotate[1]];
      ctx.font = `italic ${Math.round(13 * Math.min(1.6, s.scale))}px "Newsreader Variable", Georgia, serif`;
      ctx.fillStyle = "rgba(201,139,78,0.9)";
      ctx.textAlign = "center";
      for (const l of NATURE_LABELS) {
        if (geoDistance([l.lon, l.lat], center) > 1.2) continue;
        const p = projection([l.lon, l.lat]);
        if (p) ctx.fillText(l.name, p[0], p[1]);
      }
      ctx.globalAlpha = 1;

      // Markers (DOM)
      for (const st of settlementsRef.current) {
        const m = markerEls.current.get(st.code);
        if (!m) continue;
        const visible = geoDistance([st.lon, st.lat], center) < Math.PI / 2 - 0.08;
        const p = projection([st.lon, st.lat]);
        if (!visible || !p || s.flying) {
          m.style.opacity = "0";
          m.style.pointerEvents = "none";
          m.tabIndex = -1;
          continue;
        }
        m.style.opacity = String(s.opacity);
        m.style.pointerEvents = interactive ? "auto" : "none";
        m.tabIndex = interactive ? 0 : -1;
        m.style.transform = `translate(${p[0]}px, ${p[1]}px)`;
      }
    }

    function frame(now: number) {
      const s = state.current;
      const dt = s.lastFrame ? (now - s.lastFrame) / 1000 : 0;
      s.lastFrame = now;
      const sim = useFleetStore.getState().simTimeMs;
      if (sim !== null) s.sunLon = (12 - marsTime(new Date(sim)).mtcHours) * 15;
      if (!s.dragging && !s.flying && !reduced && interactive) s.rotate = [s.rotate[0] + AUTO_DEG_S * dt, s.rotate[1]];
      draw();
      raf = requestAnimationFrame(frame);
    }

    if (intro && !reduced) {
      // The first moment of the descent: the planet settles into place.
      const s = state.current;
      const from = { rot: [s.rotate[0] - 40, s.rotate[1] + 6] as [number, number], scale: 0.55, opacity: 0 };
      const t0 = performance.now();
      s.flying = true;
      const ir = interpolate(from.rot, s.rotate);
      const step = (now: number) => {
        const k = easeEmphasized(Math.min(1, (now - t0) / 1400));
        s.rotate = ir(k) as [number, number];
        s.scale = from.scale + (1 - from.scale) * k;
        s.opacity = k;
        if (k < 1) requestAnimationFrame(step);
        else s.flying = false;
      };
      requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(frame);

    if (interactive) {
      select(el).call(
        drag<HTMLCanvasElement, unknown>()
          .on("start", () => void (state.current.dragging = true))
          .on("drag", (e) => {
            const s = state.current;
            s.rotate = [s.rotate[0] + e.dx * 0.28, Math.max(-70, Math.min(70, s.rotate[1] - e.dy * 0.28))];
          })
          .on("end", () => void (state.current.dragging = false)),
      );
    }

    if (flyRef)
      flyRef.current = {
        flyTo: (code) => {
          const st = settlementsRef.current.find((x) => x.code === code);
          if (!st) return;
          const s = state.current;
          s.flying = true;
          const target: [number, number] = [-st.lon, -st.lat];
          // Take the short way round.
          const dLon = ((target[0] - s.rotate[0] + 540) % 360) - 180;
          const ir = interpolate(s.rotate, [s.rotate[0] + dLon, target[1]]);
          const t0 = performance.now();
          const dur = reduced ? 150 : 1300;
          const step = (now: number) => {
            const k = easeEmphasized(Math.min(1, (now - t0) / dur));
            s.rotate = ir(Math.min(1, k * 1.25)) as [number, number];
            s.scale = reduced ? 1 : 1 + 5 * Math.max(0, (k - 0.35) / 0.65) ** 2;
            s.opacity = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
            if (k < 1) requestAnimationFrame(step);
            else onArriveRef.current?.(code);
          };
          requestAnimationFrame(step);
        },
      };

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      select(el).on(".drag", null);
    };
  }, [intro, dim, interactive, flyRef]);

  return (
    <div ref={wrap} className="absolute inset-0 overflow-hidden">
      <canvas ref={canvas} className={interactive ? "cursor-grab active:cursor-grabbing" : ""} aria-hidden />
      {settlements.map((s) => (
        <SettlementMarker
          key={s.code}
          settlement={s}
          ref={(el) => {
            if (el) markerEls.current.set(s.code, el);
            else markerEls.current.delete(s.code);
          }}
          onSelect={() => flyRef?.current?.flyTo(s.code)}
        />
      ))}
    </div>
  );
}

export const worstOf = (list: Severity[]) => list.reduce<Severity>((a, b) => (sevRank(b) > sevRank(a) ? b : a), "NOMINAL");
