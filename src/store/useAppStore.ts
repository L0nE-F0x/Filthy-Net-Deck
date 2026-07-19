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
import {
  arenaTomorrowSets,
  loadCardSnap,
  markArenaNotifyFired,
  newCardsBySet,
  saveCardSnap,
  shouldFireArenaNotify,
} from "../services/setPulse";
import {
  banChangeSignature,
  diffBans,
  loadBanSnap,
  markBanNotifyFired,
  needsBaseline,
  saveBanSnap,
  shouldFireBanNotify,
  summarizeBanChanges,
  type BanChange,
} from "../services/banPulse";
import { notifyDesktop } from "../services/notify";
import { applyFullscreen } from "../services/windowMode";
import {
  applyAppearance,
  applyTheme,
  isSkinId,
  type SkinId,
  type ThemeMode,
} from "../services/theme";

const PREFS_KEY = "bbi.prefs";
const FAV_KEY = "bbi.favorites";

interface Prefs {
  defaultMode: PlayMode;
  /** Tray / desktop notify the day before an Arena set drop */
  notifyArenaEve: boolean;
  /** Desktop toast when a match is recorded (default on). */
  notifyMatchEnd: boolean;
  /** Desktop toast when a B&R announcement changes the ban lists (default on). */
  notifyBanlist: boolean;
  /** Always-on-top match HUD during Arena games (default on). */
  overlayEnabled: boolean;
  /** Launch the app fullscreen (also toggled live with F11). */
  fullscreen: boolean;
  /** Appearance — dark is the product default. */
  theme: ThemeMode;
  /** Planeswalker accent skin — orthogonal to dark/light. */
  skin: SkinId;
  /** Format shown on the Decks home last time — restored on next launch. */
  lastFormatId?: FormatId;
}

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        defaultMode?: PlayMode;
        notifyArenaEve?: boolean;
        notifyMatchEnd?: boolean;
        notifyBanlist?: boolean;
        overlayEnabled?: boolean;
        fullscreen?: boolean;
        theme?: string;
        skin?: string;
        lastFormatId?: string;
      };
      return {
        defaultMode: parsed.defaultMode === "bo3" ? "bo3" : "bo1",
        notifyArenaEve: parsed.notifyArenaEve !== false,
        // Was opt-in (=== true); default ON so match-end toasts actually fire.
        notifyMatchEnd: parsed.notifyMatchEnd !== false,
        notifyBanlist: parsed.notifyBanlist !== false,
        overlayEnabled: parsed.overlayEnabled !== false,
        fullscreen: parsed.fullscreen === true,
        theme: parsed.theme === "light" ? "light" : "dark",
        skin: isSkinId(parsed.skin) ? parsed.skin : "classic",
        lastFormatId:
          parsed.lastFormatId === "standard" || parsed.lastFormatId === "pioneer"
            ? parsed.lastFormatId
            : undefined,
      };
    }
  } catch {
    /* ignore */
  }
  return {
    defaultMode: "bo1",
    notifyArenaEve: true,
    notifyMatchEnd: true,
    notifyBanlist: true,
    overlayEnabled: true,
    fullscreen: false,
    theme: "dark",
    skin: "classic",
  };
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
  /** Selected color filters — a deck must include EVERY selected color. */
  filterColors: string[];
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
  /** Version the user dismissed with "Later" — banner stays hidden for it this session. */
  dismissedUpdateVersion: string | null;
  /** Winrate tracker (null status = not running / browser build) */
  trackerStatus: TrackerStatus | null;
  trackerMatches: TrackedMatch[];
  trackerReady: boolean;
  /** Arena-first set radar (spoilers / release dates) */
  sets: SetsBundle | null;
  setsLoading: boolean;
  setsError: string | null;
  /** scryfallIds new since last visit, keyed by set code */
  setsNewByCode: Record<string, string[]>;
  /** Ban-list changes vs the last-acknowledged snapshot (B&R pulse). */
  banChanges: BanChange[];

  setPage: (p: Page) => void;
  setMode: (m: PlayMode) => void;
  setDailyFormatId: (id: FormatId | null) => void;
  openFormat: (id: FormatId | string) => void;
  openDeck: (deckId: string) => void;
  /**
   * Jump to My Stats with a tracker deck detail open (from Climb / Matchups).
   * Consumed once by Stats on mount/page show.
   */
  openStatsDeck: (trackerDeckKey: string) => void;
  /** Pending tracker deck key for Stats detail; cleared when Stats applies it. */
  statsFocusDeckKey: string | null;
  clearStatsFocusDeck: () => void;
  /** Pending second deck for Stats compare (S5). */
  statsCompareDeckKey: string | null;
  clearStatsCompareDeck: () => void;
  openStatsCompare: (keyA: string, keyB: string) => void;
  /** Matchup Lab focus: opponent key and/or tag filter. */
  matchupsFocusOpponent: string | null;
  matchupsFocusTag: string | null;
  clearMatchupsFocus: () => void;
  openMatchupOpponent: (opponentName: string) => void;
  openMatchupTag: (tag: string) => void;
  /** Optional Format Hub tab preference. */
  formatsFocusTab: "standard" | "pioneer" | null;
  openFormatHub: (tab?: "standard" | "pioneer") => void;
  clearFormatsFocus: () => void;
  /** Pending nudge to tag last opponent (M2). */
  tagNudgeOpponent: string | null;
  clearTagNudge: () => void;
  /** Climb focus: highlight a tracker deck on the climb path. */
  climbFocusDeckKey: string | null;
  openClimbDeck: (trackerDeckKey: string) => void;
  clearClimbFocus: () => void;
  setDefaultMode: (m: PlayMode) => void;
  setNotifyArenaEve: (v: boolean) => void;
  setNotifyMatchEnd: (v: boolean) => void;
  setNotifyBanlist: (v: boolean) => void;
  setOverlayEnabled: (v: boolean) => void;
  /** Persist the fullscreen pref and apply it to the window immediately. */
  setFullscreenPref: (v: boolean) => void;
  /** Persist appearance and apply it to the document immediately. */
  setTheme: (theme: ThemeMode) => void;
  /** Persist planeswalker accent skin (keeps current dark/light). */
  setSkin: (skin: SkinId) => void;
  refreshMeta: () => Promise<void>;
  refreshSets: () => Promise<void>;
  /** Baseline the "new since last visit" snapshot — call when leaving the Sets page. */
  markSetsSeen: () => void;
  /** Acknowledge the current ban lists — clears the B&R pulse. */
  markBansSeen: () => void;
  clearError: () => void;
  toggleFavorite: (deckId: string) => void;
  isFavorite: (deckId: string) => boolean;
  setSearchQuery: (q: string) => void;
  setFilterTier: (t: 0 | 1 | 2 | 3) => void;
  toggleFilterColor: (c: string) => void;
  clearFilterColors: () => void;
  setShowFavoritesOnly: (v: boolean) => void;
  checkForUpdates: () => Promise<VersionCheckResult>;
  installUpdate: () => Promise<void>;
  dismissUpdate: () => void;
  initTracker: () => Promise<void>;
  /**
   * Re-pull status + matches from Rust. Call when the window is shown again
   * after tray hide — WebView can miss live `tracker:match` events while hidden.
   */
  refreshTracker: () => Promise<void>;
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
  applyAppearance(prefs.theme, prefs.skin);
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
    dailyFormatId: prefs.lastFormatId ?? null,
    selectedDeckId: null,
    statsFocusDeckKey: null,
    statsCompareDeckKey: null,
    matchupsFocusOpponent: null,
    matchupsFocusTag: null,
    formatsFocusTab: null,
    tagNudgeOpponent: null,
    climbFocusDeckKey: null,
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
    filterColors: [],
    showFavoritesOnly: false,
    metaDiff: { previousDate: null, changes: [] },
    updateAvailable: null,
    updating: false,
    updateProgress: null,
    dismissedUpdateVersion: null,
    trackerStatus: null,
    trackerMatches: [],
    trackerReady: false,
    sets: null,
    setsLoading: false,
    setsError: null,
    setsNewByCode: {},
    banChanges: [],

    setPage: (page) => set({ page }),
    setMode: (mode) => set({ mode }),
    setDailyFormatId: (dailyFormatId) => {
      if (dailyFormatId) {
        const next = { ...get().prefs, lastFormatId: dailyFormatId };
        savePrefs(next);
        set({ dailyFormatId, prefs: next });
        return;
      }
      set({ dailyFormatId });
    },
    openFormat: (id) => {
      const resolved = resolveFormatId(String(id)) ?? (id as FormatId);
      const next = { ...get().prefs, lastFormatId: resolved };
      savePrefs(next);
      set({
        selectedFormatId: resolved,
        dailyFormatId: resolved,
        page: "format",
        selectedDeckId: null,
        showFavoritesOnly: false,
        prefs: next,
      });
    },
    openDeck: (deckId) =>
      set({ selectedDeckId: deckId, page: "deck", showFavoritesOnly: false }),
    openStatsDeck: (trackerDeckKey) =>
      set({
        statsFocusDeckKey: trackerDeckKey,
        statsCompareDeckKey: null,
        page: "stats",
        showFavoritesOnly: false,
      }),
    clearStatsFocusDeck: () => set({ statsFocusDeckKey: null }),
    clearStatsCompareDeck: () => set({ statsCompareDeckKey: null }),
    openStatsCompare: (keyA, keyB) =>
      set({
        statsFocusDeckKey: keyA,
        statsCompareDeckKey: keyB,
        page: "stats",
        showFavoritesOnly: false,
      }),
    openMatchupOpponent: (opponentName) =>
      set({
        matchupsFocusOpponent: opponentName,
        matchupsFocusTag: null,
        page: "matchups",
        tagNudgeOpponent: null,
      }),
    openMatchupTag: (tag) =>
      set({
        matchupsFocusTag: tag,
        matchupsFocusOpponent: null,
        page: "matchups",
      }),
    clearMatchupsFocus: () =>
      set({ matchupsFocusOpponent: null, matchupsFocusTag: null }),
    openFormatHub: (tab) =>
      set({
        formatsFocusTab: tab ?? "standard",
        page: "formats",
      }),
    clearFormatsFocus: () => set({ formatsFocusTab: null }),
    clearTagNudge: () => set({ tagNudgeOpponent: null }),
    openClimbDeck: (trackerDeckKey) =>
      set({
        climbFocusDeckKey: trackerDeckKey,
        page: "climb",
      }),
    clearClimbFocus: () => set({ climbFocusDeckKey: null }),
    setDefaultMode: (m) => {
      const next = { ...get().prefs, defaultMode: m };
      savePrefs(next);
      set({ prefs: next, mode: m });
    },
    setNotifyArenaEve: (notifyArenaEve) => {
      const next = { ...get().prefs, notifyArenaEve };
      savePrefs(next);
      set({ prefs: next });
    },
    setNotifyMatchEnd: (notifyMatchEnd) => {
      const next = { ...get().prefs, notifyMatchEnd };
      savePrefs(next);
      set({ prefs: next });
    },
    setNotifyBanlist: (notifyBanlist) => {
      const next = { ...get().prefs, notifyBanlist };
      savePrefs(next);
      set({ prefs: next });
    },
    setOverlayEnabled: (overlayEnabled) => {
      const next = { ...get().prefs, overlayEnabled };
      savePrefs(next);
      set({ prefs: next });
      void import("../services/overlay").then((m) =>
        m.setOverlayEnabled(overlayEnabled),
      );
    },
    setFullscreenPref: (fullscreen) => {
      const next = { ...get().prefs, fullscreen };
      savePrefs(next);
      set({ prefs: next });
      void applyFullscreen(fullscreen);
    },
    setTheme: (theme) => {
      const next = { ...get().prefs, theme };
      savePrefs(next);
      set({ prefs: next });
      applyTheme(theme);
    },
    setSkin: (skin) => {
      const next = { ...get().prefs, skin };
      savePrefs(next);
      set({ prefs: next });
      applyAppearance(next.theme, skin);
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
    toggleFilterColor: (c) => {
      const cur = get().filterColors;
      set({
        filterColors: cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c],
      });
    },
    clearFilterColors: () => set({ filterColors: [] }),
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

    dismissUpdate: () =>
      set({ dismissedUpdateVersion: get().updateAvailable?.version ?? null }),

    refreshTracker: async () => {
      if (!isTauri()) return;
      try {
        const [status, matches] = await Promise.all([
          fetchTrackerStatus(),
          fetchTrackerMatches(),
        ]);
        // Rust is the source of truth — replace, don't merge (avoids stale gaps
        // after the WebView missed live events while the window was hidden).
        set({ trackerStatus: status, trackerMatches: matches });
      } catch {
        /* keep prior UI state */
      }
    },

    initTracker: async () => {
      if (get().trackerReady) return;
      set({ trackerReady: true });
      await get().refreshTracker();
      await subscribeTracker({
        onMatch: (m) => {
          const cur = get().trackerMatches;
          if (cur.some((x) => x.matchId === m.matchId)) return;
          set({
            trackerMatches: [m, ...cur],
            // M2: offer tagging when we know the opponent name
            tagNudgeOpponent: m.opponentName?.trim() || get().tagNudgeOpponent,
          });
          // Opt-in match-end toast — proves the tracker is alive.
          if (get().prefs.notifyMatchEnd) {
            const result =
              m.result === "win"
                ? "Win"
                : m.result === "loss"
                  ? "Loss"
                  : m.result === "draw"
                    ? "Draw"
                    : "Match";
            const opp = m.opponentName?.trim() || "opponent";
            // Include the match we just prepended.
            const withNew = [m, ...cur].filter((x) => {
              const d = new Date(x.endedAt);
              const n = new Date();
              return (
                d.getFullYear() === n.getFullYear() &&
                d.getMonth() === n.getMonth() &&
                (x.result === "win" || x.result === "loss")
              );
            });
            const wins = withNew.filter((x) => x.result === "win").length;
            const losses = withNew.filter((x) => x.result === "loss").length;
            const decided = wins + losses;
            const wr = decided ? Math.round((wins / decided) * 100) : null;
            const body =
              wr != null
                ? `${result} vs ${opp} · ${wr}% this season`
                : `${result} vs ${opp}`;
            void notifyDesktop("Filthy Net Deck", body);
          }
        },
        onStatus: (s) => {
          const prev = get().trackerStatus;
          set({ trackerStatus: s });
          // If Rust has more matches than the UI (events dropped while tray-
          // hidden), re-pull the full list. This is the main recovery path.
          const local = get().trackerMatches.length;
          if (
            typeof s.matchesRecorded === "number" &&
            s.matchesRecorded > local
          ) {
            void get().refreshTracker();
            return;
          }
          // Also re-pull if last_event_at jumped but we didn't get a match event.
          if (
            s.lastEventAt != null &&
            prev?.lastEventAt != null &&
            s.lastEventAt > prev.lastEventAt &&
            s.matchesRecorded !== local
          ) {
            void get().refreshTracker();
          }
        },
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

    markSetsSeen: () => {
      const bundle = get().sets;
      if (!bundle) return;
      saveCardSnap(bundle);
      set({ setsNewByCode: {} });
    },

    markBansSeen: () => {
      const bundle = get().sets;
      if (bundle?.formats) saveBanSnap(bundle.formats);
      set({ banChanges: [] });
    },

    refreshSets: async () => {
      set({ setsLoading: true, setsError: null });
      try {
        const prevSnap = loadCardSnap();
        const { bundle } = await fetchSetsBundle();
        // Diff against the last *seen* snapshot — do NOT save it here. The
        // hourly background sync must not erase "new since last visit"
        // badges; the snapshot is baselined by markSetsSeen when the user
        // actually leaves the Sets page.
        const setsNewByCode = newCardsBySet(bundle, prevSnap);

        // B&R pulse: diff ban lists against the last-acknowledged snapshot.
        // First sight of a format's list is a baseline, not an announcement.
        const banSnap = loadBanSnap();
        const banChanges = diffBans(bundle.formats, banSnap);
        if (!banChanges.length && needsBaseline(bundle.formats, banSnap)) {
          saveBanSnap(bundle.formats);
        }

        set({
          sets: bundle,
          setsLoading: false,
          setsError: null,
          setsNewByCode,
          banChanges,
        });

        if (banChanges.length && get().prefs.notifyBanlist) {
          const sig = banChangeSignature(banChanges);
          if (shouldFireBanNotify(sig)) {
            void notifyDesktop(
              "Banned & Restricted update",
              `${summarizeBanChanges(banChanges)}. Open Filthy Net Deck for the full lists.`,
            );
            markBanNotifyFired(sig);
          }
        }

        // Opt-in tray/desktop ping the day before Arena drops
        if (get().prefs.notifyArenaEve && shouldFireArenaNotify()) {
          const eve = arenaTomorrowSets(bundle);
          if (eve.length) {
            const names = eve.map((s) => s.name).join(", ");
            // Estimated dates (paper − 3d guess) must not be announced as fact.
            const allOfficial = eve.every(
              (s) =>
                s.datesConfidence.arena === "official" ||
                s.datesConfidence.arena === "override",
            );
            void notifyDesktop(
              allOfficial ? "Arena drop tomorrow" : "Arena drop expected tomorrow",
              allOfficial
                ? `${names} hits MTG Arena tomorrow. Open Set Radar for the gallery.`
                : `${names} is expected on MTG Arena tomorrow (estimated date). Open Set Radar for the gallery.`,
            );
            markArenaNotifyFired();
          }
        }
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
