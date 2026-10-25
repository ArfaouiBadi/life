import { Link } from "react-router";
import { useSettlements } from "@/hooks/data";
import { useFleetStore } from "@/stores/fleetStore";
import { Globe } from "@/features/map/globe/Globe";
import { Wordmark } from "@/components/hg/BrandMark";
import { Button } from "@/components/ui/button";
import { num } from "@/lib/format";
import { isMock } from "@/api";

const PLANS = [
  { name: "Basic", price: 49, for: "Pods and single residents", what: ["Air, power and water watched every second", "Alerts to every phone in the home", "Control room around the clock"] },
  { name: "Family", price: 89, for: "Most family homes", what: ["Everything in Basic", "Each person told where to go", "Playbooks run for you", "Repairs booked before parts fail"] },
  { name: "Premium", price: 149, for: "Homes that want the fastest help", what: ["Everything in Family", "Priority repair crew", "Emergency oxygen refills", "A yearly home check"] },
  { name: "Settlement", price: null, for: "Settlement companies", what: ["Every home in a dome or settlement", "Regional events in one view", "Fleet health and reports"] },
];

export default function LandingPage() {
  const { data: settlements } = useSettlements();
  const summary = useFleetStore((s) => s.summary);
  return (
    <div className="min-h-dvh bg-twilight text-glass">
      <header className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-5">
        <Wordmark />
        <nav className="flex items-center gap-5 text-mist">
          <a href="#how" className="hover:text-glass">
            How it works
          </a>
          <a href="#plans" className="hover:text-glass">
            Plans
          </a>
          <Link to="/login" className="text-glass underline underline-offset-4">
            Sign in to the demo
          </Link>
        </nav>
      </header>

      <section className="relative mx-auto grid max-w-[1200px] items-center gap-8 px-6 pb-20 pt-6 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <div>
          <h1 className="w-expanded text-[36px] font-[650] leading-[1.08] tracking-[-0.015em] md:text-[56px]">
            Other alarms tell you something is wrong. Life tells you how much time you have.
          </h1>
          <p className="mt-6 max-w-[52ch] text-[18px] text-mist">
            Round-the-clock life-safety monitoring for family homes on Mars. When a micrometeorite punctures a bedroom at 3 AM, Life works out the minutes left, tells each person where to go,
            and seals the room before the air runs out.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" asChild>
              <Link to="/login">See the control room</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/demo">Open the pitch view</Link>
            </Button>
          </div>
          {summary && (
            <p className="mt-8 tabular text-mist">
              Watching {num(summary.homes)} homes and {num(summary.residents)} people in five settlements right now.
            </p>
          )}
        </div>
        <div className="relative aspect-square w-full">{settlements && <Globe settlements={settlements} interactive={false} />}</div>
      </section>

      <section id="how" className="border-t border-hairline">
        <div className="mx-auto grid max-w-[1200px] gap-10 px-6 py-16 md:grid-cols-3">
          <div>
            <h2 className="text-[21px] font-[650]">Watch every room</h2>
            <p className="mt-2 text-mist">
              Pressure, oxygen, carbon dioxide, smoke, radiation, power and water, every second. When everything is normal the control room stays dark, so the one home in trouble stands out
              among hundreds.
            </p>
          </div>
          <div>
            <h2 className="text-[21px] font-[650]">Count the minutes left</h2>
            <p className="mt-2 text-mist">
              A puncture empties a home exponentially. Life fits that curve to live readings, confirms the leak with a second sensor, and alarms on time left, not only on today's numbers.
            </p>
          </div>
          <div>
            <h2 className="text-[21px] font-[650]">Act before it runs out</h2>
            <p className="mt-2 text-mist">
              Playbooks seal hatches, add oxygen and send a repair crew. If the link to the control room drops, the home runs the safety steps on its own, and never seals a room with someone inside.
            </p>
          </div>
        </div>
      </section>

      <section className="border-t border-hairline">
        <div className="mx-auto grid max-w-[1200px] gap-10 px-6 py-16 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <h2 className="w-expanded text-[36px] font-[650] leading-[1.1]">The physics fits on one line</h2>
            <p className="mt-4 max-w-[56ch] text-mist">
              Outside is near vacuum, so air leaves through a hole at the speed of sound. The flow is proportional to the pressure inside, which makes pressure fall exponentially. A 1.5 cm² hole in a
              416 m³ home gives an hour and 47 minutes before the air is unsafe to breathe. Seal the bedroom it's in and the rest of the house stops losing air.
            </p>
          </div>
          <div className="self-center rounded-instrument border border-hairline p-6 tabular text-[18px] leading-[1.9]">
            <div>k = 121.2 × A ÷ V = 4.37 × 10⁻⁵ /s</div>
            <div>P(t) = P₀ × e^(−k·t)</div>
            <div>
              t = ln(21.2 ÷ 16.0) ÷ k = <span className="font-[650]">1 h 47 min</span>
            </div>
          </div>
        </div>
      </section>

      <section id="plans" className="border-t border-hairline">
        <div className="mx-auto max-w-[1200px] px-6 py-16">
          <h2 className="w-expanded text-[36px] font-[650] leading-[1.1]">Plans</h2>
          <div className="mt-8 grid gap-px overflow-hidden rounded-instrument border border-hairline bg-hairline md:grid-cols-4">
            {PLANS.map((p) => (
              <div key={p.name} className="bg-twilight p-6">
                <h3 className="text-[21px] font-[650]">{p.name}</h3>
                <p className="text-mist">{p.for}</p>
                <p className="mt-4 tabular text-[24px] font-[650]">{p.price ? `${p.price} credits` : "By agreement"}</p>
                {p.price && <p className="text-mist">a month</p>}
                <ul className="mt-4 space-y-1.5">
                  {p.what.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-hairline">
        <div className="mx-auto flex max-w-[1200px] flex-wrap justify-between gap-4 px-6 py-8 text-mist">
          <span>Life, a concept for IEEE Lumen 2.0, Beyond 2030.</span>
          {isMock && <span>This demo runs on a simulation. No real sensors are connected.</span>}
        </div>
      </footer>
    </div>
  );
}
