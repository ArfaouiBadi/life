import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { api, isMock } from "@/api";
import type { ScenarioRequest } from "@/api/contracts";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useUiStore } from "@/stores/uiStore";
import { useFleetStore } from "@/stores/fleetStore";
import { useDirectory } from "@/hooks/useDirectory";
import { useHome } from "@/hooks/data";
import { reseedClientState } from "@/hooks/useRealtimeBridge";
import { isTyping } from "@/hooks/useOpsShortcuts";
import { BEATS, HERO } from "./beats";
import { cn } from "@/lib/utils";

const SPEEDS = [1, 10, 60, 300] as const;

/** Mock-only control surface for the pitch: beats, scenarios, clock. Calls api.sim.* (the one allowed exception). */
export function DemoDirector() {
  const { directorOpen, setDirector, beatMode, setBeatMode, phoneDock, setPhoneDock } = useUiStore();
  const speed = useFleetStore((s) => s.speed);
  const navigate = useNavigate();
  const { data: dir } = useDirectory();
  const [beat, setBeat] = useState(0);
  const [running, setRunning] = useState<string | null>(null);

  const playBeat = async (i: number) => {
    const b = BEATS[i];
    if (!b || running) return;
    setRunning(b.id);
    try {
      await b.run(navigate);
      setBeat(i + 1);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(null);
    }
  };

  // Space advances to the next beat (beat mode only, never while typing or on a button).
  useEffect(() => {
    if (!isMock) return;
    const onKey = (e: KeyboardEvent) => {
      if (!beatMode || e.code !== "Space" || isTyping(e)) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("button,a,[role=button],[role=dialog]")) return;
      e.preventDefault();
      void playBeat(beat % BEATS.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!isMock) return null;
  return (
    <Sheet open={directorOpen} onOpenChange={setDirector} modal={false}>
      <SheetContent side="right" overlay={false} onInteractOutside={(e) => e.preventDefault()} className="w-[400px] overflow-y-auto border-hairline bg-dusk text-glass sm:max-w-[400px]">
        <SheetHeader>
          <SheetTitle className="w-expanded text-[21px]">Demo Director</SheetTitle>
          <SheetDescription>Drives the simulation for the pitch. Only available on simulated telemetry.</SheetDescription>
        </SheetHeader>
        <div className="space-y-7 px-4 pb-8">
          <section>
            <div className="flex items-center justify-between">
              <h3 className="font-[650]">Beats</h3>
              <label className="flex items-center gap-2 text-mist">
                Space for next
                <Switch checked={beatMode} onCheckedChange={setBeatMode} aria-label="Beat mode: Space plays the next beat" />
              </label>
            </div>
            <ol className="mt-2 space-y-1">
              {BEATS.map((b, i) => (
                <li key={b.id} className={cn("flex items-start gap-3 rounded-instrument px-2 py-2", beat === i && "bg-dusk-high")}>
                  <span className="mt-0.5 w-4 tabular text-mist">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-[560]">{b.title}</div>
                    <p className="text-mist">{b.says}</p>
                  </div>
                  <Button size="sm" variant={beat === i ? "default" : "outline"} disabled={running !== null} onClick={() => void playBeat(i)}>
                    {running === b.id ? "Playing" : "Play"}
                  </Button>
                </li>
              ))}
            </ol>
            <label className="mt-3 flex items-center justify-between text-mist">
              Show the family's phone beside the console
              <Switch checked={phoneDock} onCheckedChange={setPhoneDock} />
            </label>
          </section>

          <section>
            <h3 className="font-[650]">Speed</h3>
            <div className="mt-2 grid grid-cols-4 gap-1 rounded-control border border-hairline p-0.5" role="radiogroup" aria-label="Simulation speed">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  role="radio"
                  aria-checked={speed === s}
                  onClick={() => void api.sim.setSpeed(s)}
                  className={cn("rounded-[4px] py-1.5 tabular", speed === s ? "bg-glass text-twilight font-[650]" : "text-mist hover:text-glass")}
                >
                  ×{s}
                </button>
              ))}
            </div>
          </section>

          <LocalTime />
          <Scenarios homes={dir?.homes.map((h) => h.code) ?? []} settlements={dir?.settlements.map((s) => ({ id: s.id, name: s.name })) ?? []} />

          <section>
            <h3 className="font-[650]">Reset</h3>
            <ResetWorld />
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function LocalTime() {
  const { data: dir } = useDirectory();
  const [sid, setSid] = useState<string>("");
  const [time, setTime] = useState("03:07");
  const settlementId = sid || String(dir?.settlements[0]?.id ?? "");
  return (
    <section>
      <h3 className="font-[650]">Set local time</h3>
      <p className="text-mist">Moves the clock forward so the settlement's local time matches. Time never runs backward.</p>
      <div className="mt-2 flex gap-2">
        <Select value={settlementId} onValueChange={setSid}>
          <SelectTrigger className="flex-1" aria-label="Settlement">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {dir?.settlements.map((s) => (
              <SelectItem key={s.id} value={String(s.id)}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          aria-label="Local time"
          className="w-28 rounded-control border border-hairline bg-twilight px-2 tabular [color-scheme:dark]"
        />
        <Button
          variant="outline"
          onClick={() => {
            const [h, m] = time.split(":").map(Number);
            void api.sim.setLocalTime(Number(settlementId), h + m / 60).then(() => toast(`Local time set to ${time}`));
          }}
        >
          Set
        </Button>
      </div>
    </section>
  );
}

function Scenarios({ homes, settlements }: { homes: string[]; settlements: { id: number; name: string }[] }) {
  const [homeCode, setHomeCode] = useState(HERO);
  const { data: home } = useHome(homeCode);
  const [roomId, setRoomId] = useState<string>("");
  const [area, setArea] = useState(1.5);
  const [settlementId, setSettlementId] = useState<string>("");
  const [tau, setTau] = useState(4);
  const sid = settlementId || String(settlements.find((s) => s.name === "Arcadia Reach")?.id ?? settlements[0]?.id ?? "");
  const defaultRoom = home?.rooms.find((r) => r.code === "BED2" || r.code === "BED")?.id;
  const inject = (req: ScenarioRequest, done: string) =>
    api.sim.injectScenario(req).then(
      () => toast(done),
      (e: Error) => toast.error(e.message),
    );
  const homeReq = { homeId: home?.id };

  return (
    <section className="space-y-4">
      <h3 className="font-[650]">Scenarios</h3>
      <div className="space-y-2">
        <Select value={homeCode} onValueChange={(v) => (setHomeCode(v), setRoomId(""))}>
          <SelectTrigger aria-label="Home">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {homes.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Select value={roomId || String(defaultRoom ?? "")} onValueChange={setRoomId}>
            <SelectTrigger className="flex-1" aria-label="Room">
              <SelectValue placeholder="Room" />
            </SelectTrigger>
            <SelectContent>
              {home?.rooms
                .filter((r) => r.type !== "AIRLOCK")
                .map((r) => (
                  <SelectItem key={r.id} value={String(r.id)}>
                    {r.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Button onClick={() => inject({ kind: "BREACH", ...homeReq, roomId: Number(roomId || defaultRoom), intensity: area }, `Breach of ${area.toFixed(2)} cm² started`)}>Breach</Button>
        </div>
        <label className="block text-mist">
          Hole size <span className="tabular text-glass">{area.toFixed(2)} cm²</span>
          <Slider className="mt-2" min={0.25} max={5} step={0.25} value={[area]} onValueChange={([v]) => setArea(v)} aria-label="Hole size in square centimetres" />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => inject({ kind: "SCRUBBER_FAILURE", ...homeReq }, "Scrubber failed")}>
            Scrubber failure
          </Button>
          <Button variant="outline" onClick={() => inject({ kind: "FIRE", ...homeReq }, "Kitchen fire started")}>
            Kitchen fire
          </Button>
          <Button variant="outline" onClick={() => inject({ kind: "RECYCLER_FAILURE", ...homeReq }, "Water recycler failed")}>
            Recycler failure
          </Button>
          <Button variant="outline" onClick={() => inject({ kind: "GATEWAY_OFFLINE", ...homeReq, durationSec: 60 }, "Home gateway offline for 60 s")}>
            Gateway offline
          </Button>
        </div>
      </div>

      <div className="space-y-2 border-t border-hairline pt-4">
        <Select value={sid} onValueChange={setSettlementId}>
          <SelectTrigger aria-label="Settlement">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {settlements.map((s) => (
              <SelectItem key={s.id} value={String(s.id)}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="block text-mist">
          Dust optical depth <span className="tabular text-glass">τ {tau.toFixed(1)}</span>
          <Slider className="mt-2" min={1} max={6} step={0.5} value={[tau]} onValueChange={([v]) => setTau(v)} aria-label="Dust optical depth" />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => inject({ kind: "DUST_STORM", settlementId: Number(sid), intensity: tau }, "Dust storm started")}>
            Dust storm
          </Button>
          <Button variant="outline" onClick={() => inject({ kind: "SOLAR_PARTICLE_EVENT", settlementId: Number(sid) }, "Solar storm arriving")}>
            Solar storm here
          </Button>
          <Button variant="outline" onClick={() => inject({ kind: "SOLAR_PARTICLE_EVENT" }, "Solar storm over every settlement")}>
            Solar storm everywhere
          </Button>
          <Button variant="outline" onClick={() => inject({ kind: "UPLINK_LOST", durationSec: 30 }, "Uplink lost for 30 s")}>
            Lose the uplink
          </Button>
        </div>
      </div>
    </section>
  );
}

function ResetWorld() {
  const [seed, setSeed] = useState("2061");
  return (
    <div className="mt-2 flex gap-2">
      <input
        value={seed}
        onChange={(e) => setSeed(e.target.value.replace(/\D/g, ""))}
        inputMode="numeric"
        aria-label="Seed"
        className="w-28 rounded-control border border-hairline bg-twilight px-2 tabular"
      />
      <Button
        variant="outline"
        onClick={async () => {
          await api.sim.reset(Number(seed) || 2061);
          await reseedClientState();
          toast(`World rebuilt from seed ${seed}`);
        }}
      >
        Rebuild the world
      </Button>
    </div>
  );
}
