import { create } from "zustand";
import { fetchMetaBundle } from "../services/metaFeed";
import { computeDiff, saveSnapshot, type MetaChange } from "../services/metaDiff";
import { fetchRemoteVersion, isNewer } from "../services/versionCheck";
import { resolveFormatId } from "../services/formatResolve";
import type { FormatId, MetaBundle, Page, PlayMode } from "../types/meta";

const PREFS_KEY = "bbi.prefs";
const FAV_KEY = "bbi.favorites";

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

function loadFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    if (raw) return JSON.parse(raw) as string[];
  } catch {
    /* ignore */
  }
  return [];
}

function saveFavorites(ids: string[]) {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

export type FeedStatus = "live" | "cached" | "offline" | null;

interface AppState {
  page: Page;
  mode: PlayMode;
  selectedFormatId: FormatId | null;
  selectedDeckId: string | null;
  meta: MetaBundle | null;
  metaSource: "network" | "seed" | "cache" | null;
  feedStatus: FeedStatus;
  loading: boolean;
  error: string | null;
  lastRefresh: string | null;
  prefs: Prefs;
  favorites: string[];
  searchQuery: string;
  filterTier: 0 | 1 | 2 | 3;
  filterColor: string | null;
  showFavoritesOnly: boolean;
  metaDiff: { previousDate: string | null; changes: MetaChange[] };
  updateAvailable: { version: string; downloadUrl?: string } | null;
  viewerUrl: string | null;

  setPage: (p: Page) => void;
  setMode: (m: PlayMode) => void;
  openFormat: (id: FormatId | string) => void;
  openDeck: (deckId: string) => void;
  setDefaultMode: (m: PlayMode) => void;
  setMetaUrl: (url: string) => void;
  refreshMeta: () => Promise<void>;
  clearError: () => void;
  toggleFavorite: (deckId: string) => void;
  isFavorite: (deckId: string) => boolean;
  setSearchQuery: (q: string) => void;
  setFilterTier: (t: 0 | 1 | 2 | 3) => void;
  setFilterColor: (c: string | null) => void;
  setShowFavoritesOnly: (v: boolean) => void;
  checkForUpdates: () => Promise<void>;
  openViewer: (url: string) => void;
  closeViewer: () => void;
}

function mapFeedStatus(from: "network" | "seed" | "cache"): FeedStatus {
  if (from === "network") return "live";
  if (from === "cache") return "cached";
  return "offline";
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
    feedStatus: null,
    loading: false,
    error: null,
    lastRefresh: null,
    prefs,
    favorites: loadFavorites(),
    searchQuery: "",
    filterTier: 0,
    filterColor: null,
    showFavoritesOnly: false,
    metaDiff: { previousDate: null, changes: [] },
    updateAvailable: null,
    viewerUrl: null,

    setPage: (page) => set({ page, ...(page === "daily" ? {} : {}) }),
    setMode: (mode) => set({ mode }),
    openFormat: (id) => {
      const resolved = resolveFormatId(String(id)) ?? (id as FormatId);
      set({
        selectedFormatId: resolved,
        page: "format",
        selectedDeckId: null,
        showFavoritesOnly: false,
      });
    },
    openDeck: (deckId) =>
      set({ selectedDeckId: deckId, page: "deck", showFavoritesOnly: false }),
    setDefaultMode: (m) => {
      const next = { ...get().prefs, defaultMode: m };
      savePrefs(next);
      set({ prefs: next, mode: m });
    },
    setMetaUrl: (url) => {
      const next = { ...get().prefs, metaUrl: url.trim() || undefined };
      savePrefs(next);
      set({ prefs: next });
    },
    clearError: () => set({ error: null }),

    toggleFavorite: (deckId) => {
      const cur = get().favorites;
      const next = cur.includes(deckId)
        ? cur.filter((id) => id !== deckId)
        : [...cur, deckId];
      saveFavorites(next);
      set({ favorites: next });
    },
    isFavorite: (deckId) => get().favorites.includes(deckId),

    setSearchQuery: (searchQuery) => set({ searchQuery }),
    setFilterTier: (filterTier) => set({ filterTier }),
    setFilterColor: (filterColor) => set({ filterColor }),
    setShowFavoritesOnly: (showFavoritesOnly) => set({ showFavoritesOnly }),

    openViewer: (url) => set({ viewerUrl: url }),
    closeViewer: () => set({ viewerUrl: null }),

    checkForUpdates: async () => {
      const remote = await fetchRemoteVersion();
      if (remote && isNewer(remote.version)) {
        set({
          updateAvailable: {
            version: remote.version,
            downloadUrl: remote.downloadUrl,
          },
        });
      } else {
        set({ updateAvailable: null });
      }
    },

    refreshMeta: async () => {
      set({ loading: true, error: null });
      try {
        const { bundle, from } = await fetchMetaBundle();
        const diff = computeDiff(bundle);
        // Save snapshot of *previous* was already loaded; save current after diff
        saveSnapshot(bundle);
        set({
          meta: bundle,
          metaSource: from,
          feedStatus: mapFeedStatus(from),
          loading: false,
          lastRefresh: new Date().toISOString(),
          metaDiff: diff,
        });
        void get().checkForUpdates();
      } catch (e) {
        set({
          loading: false,
          error: e instanceof Error ? e.message : "Failed to load meta",
        });
      }
    },
  };
});
