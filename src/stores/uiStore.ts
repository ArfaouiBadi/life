import { create } from "zustand";
import type { Severity } from "@/api/contracts";
import { setMuted } from "@/lib/sound";

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode: fine */
  }
};

interface UiState {
  muted: boolean;
  presentation: boolean;
  incidentColumnOpen: boolean;
  severityFilter: Severity | null;
  directorOpen: boolean;
  paletteOpen: boolean;
  shortcutsOpen: boolean;
  focusedIncidentId: number | null;
  focusSettlement: string | null;
  phoneDock: boolean;
  beatMode: boolean;
  setPhoneDock: (v: boolean) => void;
  setBeatMode: (v: boolean) => void;
  setFocusSettlement: (code: string | null) => void;
  toggleMute: () => void;
  togglePresentation: () => void;
  setIncidentColumn: (open: boolean) => void;
  setSeverityFilter: (s: Severity | null) => void;
  setDirector: (open: boolean) => void;
  setPalette: (open: boolean) => void;
  setShortcuts: (open: boolean) => void;
  focusIncident: (id: number | null) => void;
}

const initialMuted = read("life.muted") === "1";
setMuted(initialMuted);

export const useUiStore = create<UiState>((set, get) => ({
  muted: initialMuted,
  presentation: false,
  incidentColumnOpen: true,
  severityFilter: null,
  directorOpen: false,
  paletteOpen: false,
  shortcutsOpen: false,
  focusedIncidentId: null,
  focusSettlement: null,
  phoneDock: false,
  beatMode: false,
  setPhoneDock: (phoneDock) => set({ phoneDock }),
  setBeatMode: (beatMode) => set({ beatMode }),
  setFocusSettlement: (focusSettlement) => set({ focusSettlement }),
  toggleMute: () => {
    const muted = !get().muted;
    setMuted(muted);
    write("life.muted", muted ? "1" : "0");
    set({ muted });
  },
  togglePresentation: () => {
    const presentation = !get().presentation;
    document.documentElement.style.zoom = presentation ? "1.12" : "";
    set({ presentation, beatMode: presentation || get().beatMode, incidentColumnOpen: presentation ? true : get().incidentColumnOpen });
  },
  setIncidentColumn: (incidentColumnOpen) => set({ incidentColumnOpen }),
  setSeverityFilter: (severityFilter) => set({ severityFilter }),
  setDirector: (directorOpen) => set({ directorOpen }),
  setPalette: (paletteOpen) => set({ paletteOpen }),
  setShortcuts: (shortcutsOpen) => set({ shortcutsOpen }),
  focusIncident: (focusedIncidentId) => set({ focusedIncidentId }),
}));
