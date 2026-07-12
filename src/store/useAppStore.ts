import { create } from "zustand";
import { fetchMetaBundle } from "../services/metaFeed";
import { computeDiff, saveSnapshot, type MetaChange } from "../services/metaDiff";
import {
  checkRemoteVersion,
  type VersionCheckResult,
} from "../services/versionCheck";
import { checkAppUpdate, installPendingUpdate } from "../services/appUpdater";
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

export type FeedStatus = "live" | "cached" | null;

interface AppState {
  page: Page;
  mode: PlayMode;
  selectedFormatId: FormatId | null;
  /** Format shown on the Decks (Daily) home hero/list */
  dailyFormatId: FormatId | null;
  selectedDeckId: string | null;
  meta: MetaBundle | null;
  metaSource: "network" | "cache" | null;
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
  updateAvailable: {
    version: string;
    downloadUrl?: string;
    notes?: string;
    /** true = Tauri updater can install + relaunch in one click */
    canAutoInstall?: boolean;
  } | null;
  /** In-app update install state */
  updating: boolean;
  updateProgress: number | null;

  setPage: (p: Page) => void;
  setMode: (m: PlayMode) => void;
  setDailyFormatId: (id: FormatId | null) => void;
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
  checkForUpdates: () => Promise<VersionCheckResult>;
  installUpdate: () => Promise<void>;
  dismissUpdate: () => void;
}

function mapFeedStatus(from: "network" | "cache"): FeedStatus {
  return from === "network" ? "live" : "cached";
}

export const useAppStore = create<AppState>((set, get) => {
  const prefs = loadPrefs();
  return {
    page: "daily",
    mode: prefs.defaultMode,
    selectedFormatId: null,
    dailyFormatId: null,
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
    updating: false,
    updateProgress: null,

    setPage: (page) => set({ page }),
    setMode: (mode) => set({ mode }),
    setDailyFormatId: (dailyFormatId) => set({ dailyFormatId }),
    openFormat: (id) => {
      const resolved = resolveFormatId(String(id)) ?? (id as FormatId);
      set({
        selectedFormatId: resolved,
        dailyFormatId: resolved,
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

    checkForUpdates: async () => {
      // Preferred: Tauri updater (signed, one-click install + relaunch)
      const auto = await checkAppUpdate();
      if (auto) {
        set({
          updateAvailable: {
            version: auto.version,
            notes: auto.notes,
            canAutoInstall: true,
          },
        });
        return {
          status: "update",
          remote: { version: auto.version, notes: auto.notes },
        };
      }
      // Fallback: version.json manual-download flow (also covers browser dev)
      const result = await checkRemoteVersion();
      if (result.status === "update") {
        set({
          updateAvailable: {
            version: result.remote.version,
            downloadUrl: result.remote.downloadUrl,
            notes: result.remote.notes,
            canAutoInstall: false,
          },
        });
      } else {
        set({ updateAvailable: null });
      }
      return result;
    },

    installUpdate: async () => {
      if (get().updating) return;
      set({ updating: true, updateProgress: 0, error: null });
      try {
        await installPendingUpdate((pct) => set({ updateProgress: pct }));
        // relaunch() exits the app — nothing to do after this
      } catch (e) {
        set({
          updating: false,
          updateProgress: null,
          error:
            e instanceof Error
              ? `Update failed: ${e.message}. You can still download the installer from Settings.`
              : "Update failed — download the installer from Settings instead.",
        });
      }
    },

    dismissUpdate: () => set({ updateAvailable: null }),

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
