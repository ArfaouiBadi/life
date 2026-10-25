import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { useSettlements } from "@/hooks/data";
import { useFleetStore } from "@/stores/fleetStore";
import { useUiStore } from "@/stores/uiStore";
import { Globe, type GlobeHandle } from "./Globe";
import { Loading } from "@/components/hg/Loading";
import { num, plural } from "@/lib/format";

let introPlayed = false;

/** Planet level: the most characteristic thing in this world is Mars itself. */
export function PlanetPage() {
  const { data: settlements, isLoading } = useSettlements();
  const summary = useFleetStore((s) => s.summary);
  const setFocus = useUiStore((s) => s.setFocusSettlement);
  const navigate = useNavigate();
  const loc = useLocation();
  const fly = useRef<GlobeHandle | null>(null);
  const intro = !introPlayed;
  const descend = (loc.state as { descend?: string[] } | null)?.descend;

  useEffect(() => {
    introPlayed = true;
    setFocus(null);
  }, [setFocus]);

  // Demo beat: one continuous move from the planet down to a home.
  useEffect(() => {
    if (!descend?.length || !settlements) return;
    const t = setTimeout(() => fly.current?.flyTo(descend[0]), 900);
    return () => clearTimeout(t);
  }, [descend, settlements]);

  if (isLoading || !settlements) return <Loading label="Finding Mars" />;

  return (
    <div className="absolute inset-0">
      <Globe
        settlements={settlements}
        intro={intro}
        flyRef={fly}
        onArrive={(code) => navigate(`/ops/map/${code}`, { state: { fromPlanet: true, descend: descend?.slice(1) } })}
      />
      <div className="pointer-events-none absolute left-6 top-5">
        <h1 className="w-expanded text-[36px] font-[650] leading-[1.1]">Mars</h1>
        {summary && (
          <p className="mt-1 text-mist tabular">
            {plural(settlements.length, "settlement", "settlements")}, {num(summary.homes)} homes, {num(summary.residents)} people
          </p>
        )}
      </div>
      <p className="pointer-events-none absolute bottom-5 left-6 max-w-[40ch] text-mist">
        Drag to turn the planet. Choose a settlement to fly down to it. The shaded side is night.
      </p>
    </div>
  );
}
