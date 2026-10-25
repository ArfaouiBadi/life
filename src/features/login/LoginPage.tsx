import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { api, isMock, setActor } from "@/api";
import { useSettlements } from "@/hooks/data";
import { useFleetStore } from "@/stores/fleetStore";
import { LANDING, useSessionStore } from "@/stores/sessionStore";
import { Globe } from "@/features/map/globe/Globe";
import { Wordmark } from "@/components/hg/BrandMark";
import { ROLE_WORD, num } from "@/lib/format";
import { unlockAudio } from "@/lib/sound";
import type { Role } from "@/api/contracts";

const IDENTITIES: { code: string; name: string; role: Role; blurb: string }[] = [
  { code: "OPS", name: "Lina Haddad", role: "OPERATOR", blurb: "Watches every home on Mars from the night-shift control room." },
  { code: "SUP", name: "Karim Ben Salah", role: "SUPERVISOR", blurb: "The operator view, plus fleet health and overrides." },
  { code: "RES", name: "Amira Trabelsi", role: "HOMEOWNER", blurb: "Her family's home in New Jezero, on her phone." },
  { code: "TEC", name: "Nabil Jendoubi", role: "TECHNICIAN", blurb: "Repairs booked before the parts fail." },
  { code: "ADM", name: "Sarra Kchaou", role: "ADMIN", blurb: "Subscriptions, and bringing a new home online." },
];

export function LoginPage() {
  const { data: settlements } = useSettlements();
  const homes = useFleetStore((s) => s.summary?.homes);
  const signIn = useSessionStore((s) => s.signIn);
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);

  const choose = async (code: string) => {
    unlockAudio(); // this click is the user gesture browsers require before alarms can sound
    setBusy(code);
    try {
      const session = await api.login(code);
      signIn(session);
      setActor(session.user.name);
      navigate(LANDING[session.user.role]);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(null);
    }
  };

  return (
    <div className="relative min-h-dvh overflow-hidden bg-twilight text-glass">
      <div className="absolute inset-y-0 right-[-18%] w-[80%]" aria-hidden>
        {settlements && <Globe settlements={settlements} dim interactive={false} />}
      </div>
      <div className="relative z-10 flex min-h-dvh max-w-[620px] flex-col px-8 py-8 md:px-14">
        <Wordmark />
        <div className="my-auto py-12">
          <h1 className="w-expanded max-w-[14ch] text-[36px] font-[650] leading-[1.1] tracking-[-0.01em] md:text-[48px]">Choose who you are for this demo</h1>
          <ul className="mt-10 border-t border-hairline" aria-label="Demo identities">
            {IDENTITIES.map((id) => (
              <li key={id.code} className="border-b border-hairline">
                <button
                  type="button"
                  onClick={() => choose(id.code)}
                  disabled={busy !== null}
                  className="flex w-full items-baseline gap-4 py-4 pr-2 text-left hover:bg-dusk/70 disabled:opacity-60"
                >
                  <span className="w-44 shrink-0">
                    <span className="block text-[16px] font-[560]">{id.name}</span>
                    <span className="block text-mist">{ROLE_WORD[id.role]}</span>
                  </span>
                  <span className="text-mist">{busy === id.code ? "Signing in" : id.blurb}</span>
                </button>
              </li>
            ))}
          </ul>
          {isMock && (
            <p className="mt-6 max-w-[52ch] text-mist">
              This demo runs on a simulation of {homes ? num(homes) : "452"} homes. No real sensors are connected.
            </p>
          )}
        </div>
        <p className="flex gap-5 text-mist">
          <Link to="/demo" className="underline underline-offset-4 hover:text-glass">
            Open the pitch view
          </Link>
          <Link to="/" className="underline underline-offset-4 hover:text-glass">
            What is Life?
          </Link>
        </p>
      </div>
    </div>
  );
}
