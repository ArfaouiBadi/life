import { create } from "zustand";
import type { Role, Session } from "@/api/contracts";

const KEY = "life.session";

function load(): Session | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

interface SessionState {
  session: Session | null;
  signIn: (s: Session) => void;
  signOut: () => void;
}

// sessionStorage so a reload during the pitch keeps you signed in.
export const useSessionStore = create<SessionState>((set) => ({
  session: load(),
  signIn: (session) => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(session));
    } catch {
      /* ignore */
    }
    set({ session });
  },
  signOut: () => {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    set({ session: null });
  },
}));

export const LANDING: Record<Role, string> = {
  OPERATOR: "/ops/map",
  SUPERVISOR: "/ops/map",
  RESPONDER: "/ops/incidents",
  HOMEOWNER: "/resident",
  HOUSEHOLD_MEMBER: "/resident",
  TECHNICIAN: "/tech",
  ADMIN: "/admin",
  INSURER: "/login",
};
