import { create } from "zustand";
import { fetchMetaBundle } from "../services/metaFeed";
import { fetchSetsBundle } from "../services/setsFeed";
import { computeDiff, saveSnapshot, type MetaChange } from "../services/metaDiff";
import {
  checkRemoteVersion,
  type VersionCheckResult,
} from "../services/versionCheck";
import {
  checkAppUpdate,
  installPendingUpdate,
  installSilentFromUrl,
  isTauri,
  type UpdateInstallMode,
} from "../services/appUpdater";
import { resolveFormatId } from "../services/formatResolve";
import {
  clearTrackerHistory,
  deleteTrackerMatches,
  fetchTrackerMatches,
  fetchTrackerStatus,
  subscribeTracker,
} from "../services/tracker";
import type { FormatId, MetaBundle, Page, PlayMode } from "../types/meta";
import type { SetsBundle } from "../types/sets";
import type { TrackedMatch, TrackerStatus } from "../types/tracker";

const PREFS_KEY = "bbi.prefs";
const FAV_KEY = "bbi.favorites";

interface Prefs {
  defaultMode: PlayMode;
}

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { defaultMode?: PlayMode };
      return { defaultMode: parsed.defaultMode === "bo3" ? "bo3" : "bo1" };
    }
  } catch {
    /* ignore */
  }
  return { defaultMode: "bo1" };
}

function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
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
    /** true = one-click in-app install (signed updater or silent NSIS) */
    canAutoInstall?: boolean;
    installMode?: UpdateInstallMode;
  } | null;
  /** In-app update install state */
  updating: boolean;
  updateProgress: number | null;
  /** Winrate tracker (null status = not running / browser build) */
  trackerStatus: TrackerStatus | null;
  trackerMatches: TrackedMatch[];
  trackerReady: boolean;
  /** Arena-first set radar (spoilers / release dates) */
  sets: SetsBundle | null;
  setsLoading: boolean;
  setsError: string | null;

  setPage: (p: Page) => void;
  setMode: (m: PlayMode) => void;
  setDailyFormatId: (id: FormatId | null) => void;
  openFormat: (id: FormatId | string) => void;
  openDeck: (deckId: string) => void;
  setDefaultMode: (m: PlayMode) => void;
  refreshMeta: () => Promise<void>;
  refreshSets: () => Promise<void>;
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
  initTracker: () => Promise<void>;
  clearTracker: () => Promise<void>;
  deleteMatches: (matchIds: string[]) => Promise<void>;
}

function mapFeedStatus(from: "network" | "cache"): FeedStatus {
  return from === "network" ? "live" : "cached";
}

// Dev-only handle for driving the store from a plain browser (no Tauri).
declare global {
  interface Window {
    __fndStore?: typeof useAppStore;
  }
}

export const useAppStore = create<AppState>((set, get) => {
  const prefs = loadPrefs();
  // The test-only meta URL override was removed in 0.8.3 — clear any leftover.
  try {
    localStorage.removeItem("bbi.metaUrl");
  } catch {
    /* ignore */
  }
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
    trackerStatus: null,
    trackerMatches: [],
    trackerReady: false,
    sets: null,
    setsLoading: false,
    setsError: null,

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
      // Preferred: signed Tauri updater (minisign + plugin)
      const auto = await checkAppUpdate();
      if (auto) {
        set({
          updateAvailable: {
            version: auto.version,
            notes: auto.notes,
            canAutoInstall: true,
            installMode: "signed",
          },
        });
        return {
          status: "update",
          remote: { version: auto.version, notes: auto.notes },
        };
      }
      // Fallback: version.json — on desktop, silent NSIS install (no browser)
      const result = await checkRemoteVersion();
      if (result.status === "update") {
        const silent = isTauri() && !!result.remote.downloadUrl;
        set({
          updateAvailable: {
            version: result.remote.version,
            downloadUrl: result.remote.downloadUrl,
            notes: result.remote.notes,
            canAutoInstall: silent,
            installMode: silent ? "silent" : "browser",
          },
        });
      } else {
        set({ updateAvailable: null });
      }
      return result;
    },

    installUpdate: async () => {
      if (get().updating) return;
      const available = get().updateAvailable;
      if (!available) return;
      set({ updating: true, updateProgress: 0, error: null });
      try {
        if (available.installMode === "signed") {
          await installPendingUpdate((pct) => set({ updateProgress: pct }));
          // relaunch() exits the app
          return;
        }
        if (available.installMode === "silent" && available.downloadUrl) {
          await installSilentFromUrl(available.downloadUrl, (pct) =>
            set({ updateProgress: pct }),
          );
          // Rust exits + relaunches
          return;
        }
        throw new Error("No in-app install path available for this update.");
      } catch (e) {
        set({
          updating: false,
          updateProgress: null,
          error:
            e instanceof Error
              ? `Update failed: ${e.message}. You can still download the installer from the website.`
              : "Update failed — download the installer from the website instead.",
        });
      }
    },

    dismissUpdate: () => set({ updateAvailable: null }),

    initTracker: async () => {
      if (get().trackerReady) return;
      set({ trackerReady: true });
      const [status, matches] = await Promise.all([
        fetchTrackerStatus(),
        fetchTrackerMatches(),
      ]);
      set({ trackerStatus: status, trackerMatches: matches });
      await subscribeTracker({
        onMatch: (m) => {
          const cur = get().trackerMatches;
          if (cur.some((x) => x.matchId === m.matchId)) return;
          set({ trackerMatches: [m, ...cur] });
        },
        onStatus: (s) => set({ trackerStatus: s }),
      });
    },

    deleteMatches: async (matchIds) => {
      try {
        await deleteTrackerMatches(matchIds);
        const drop = new Set(matchIds);
        set({
          trackerMatches: get().trackerMatches.filter((m) => !drop.has(m.matchId)),
        });
      } catch (e) {
        set({
          error:
            e instanceof Error
              ? `Could not delete matches: ${e.message}`
              : "Could not delete matches",
        });
      }
    },

    clearTracker: async () => {
      try {
        await clearTrackerHistory();
        set({ trackerMatches: [] });
      } catch (e) {
        set({
          error:
            e instanceof Error ? `Could not clear history: ${e.message}` : "Could not clear history",
        });
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
        void get().refreshSets();
      } catch (e) {
        set({
          loading: false,
          error: e instanceof Error ? e.message : "Failed to load meta",
        });
        // Still try set radar even if deck meta failed
        void get().refreshSets();
      }
    },

    refreshSets: async () => {
      set({ setsLoading: true, setsError: null });
      try {
        const { bundle } = await fetchSetsBundle();
        set({ sets: bundle, setsLoading: false, setsError: null });
      } catch (e) {
        set({
          setsLoading: false,
          setsError: e instanceof Error ? e.message : "Failed to load sets",
        });
      }
    },
  };
});

if (import.meta.env.DEV && typeof window !== "undefined") {
  window.__fndStore = useAppStore;
}
