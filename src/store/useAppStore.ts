import { create } from "zustand";
import { fetchMetaBundle } from "../services/metaFeed";
import type { FormatId, MetaBundle, Page, PlayMode } from "../types/meta";

const PREFS_KEY = "bbi.prefs";

interface Prefs {
  defaultMode: PlayMode;
  metaUrl?: string;
}

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return JSON.parse(raw) as Prefs;
  } catch {
    /* ignore */
  }
  return { defaultMode: "bo1" };
}

function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
    if (p.metaUrl) localStorage.setItem("bbi.metaUrl", p.metaUrl);
    else localStorage.removeItem("bbi.metaUrl");
  } catch {
    /* ignore */
  }
}

interface AppState {
  page: Page;
  mode: PlayMode;
  selectedFormatId: FormatId | null;
  selectedDeckId: string | null;
  meta: MetaBundle | null;
  metaSource: "network" | "seed" | "cache" | null;
  loading: boolean;
  error: string | null;
  lastRefresh: string | null;
  prefs: Prefs;

  setPage: (p: Page) => void;
  setMode: (m: PlayMode) => void;
  openFormat: (id: FormatId) => void;
  openDeck: (deckId: string) => void;
  setDefaultMode: (m: PlayMode) => void;
  setMetaUrl: (url: string) => void;
  refreshMeta: () => Promise<void>;
  clearError: () => void;
}

export const useAppStore = create<AppState>((set, get) => {
  const prefs = loadPrefs();
  return {
    page: "daily",
    mode: prefs.defaultMode,
    selectedFormatId: null,
    selectedDeckId: null,
    meta: null,
    metaSource: null,
    loading: false,
    error: null,
    lastRefresh: null,
    prefs,

    setPage: (page) => set({ page }),
    setMode: (mode) => set({ mode }),
    openFormat: (id) =>
      set({ selectedFormatId: id, page: "format", selectedDeckId: null }),
    openDeck: (deckId) => set({ selectedDeckId: deckId, page: "deck" }),
    setDefaultMode: (m) => {
      const prefs = { ...get().prefs, defaultMode: m };
      savePrefs(prefs);
      set({ prefs, mode: m });
    },
    setMetaUrl: (url) => {
      const prefs = { ...get().prefs, metaUrl: url.trim() || undefined };
      savePrefs(prefs);
      set({ prefs });
    },
    clearError: () => set({ error: null }),

    refreshMeta: async () => {
      set({ loading: true, error: null });
      try {
        const { bundle, from } = await fetchMetaBundle();
        set({
          meta: bundle,
          metaSource: from,
          loading: false,
          lastRefresh: new Date().toISOString(),
        });
      } catch (e) {
        set({
          loading: false,
          error: e instanceof Error ? e.message : "Failed to load meta",
        });
      }
    },
  };
});
