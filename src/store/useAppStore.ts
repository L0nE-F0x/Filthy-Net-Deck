import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { APP_VERSION } from "../version";
import { fetchMetaBundle } from "../services/metaFeed";
import { fetchSetsBundle } from "../services/setsFeed";
import { computeDiff, saveSnapshot, type MetaChange } from "../services/metaDiff";
import {
  checkRemoteVersion,
  type VersionCheckResult,
} from "../services/versionCheck";
import {
  checkAppUpdateSigned,
  installPendingUpdate,
  isTauri,
  resolveUpdateOffer,
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
import { notifyDesktop, setTopmostToastEnabled } from "../services/notify";
import {
  markMetaMoverNotifyFired,
  metaMoverSignature,
  shouldFireMetaMoverNotify,
  summarizeMetaMovers,
} from "../services/metaMoverHabit";
import {
  normalizeDensity,
  normalizeOpacity,
  type OverlayDensity,
} from "../overlay/overlayModel";
import { pushOverlayPrefs, setPresenceEnabled as setPresenceEnabledRust, setOverlayEnabled as setOverlayEnabledRust, setOverlayPostMatch as setOverlayPostMatchRust, setNotifyMatchEndRust } from "../services/overlay";
import { applyFullscreen } from "../services/windowMode";
import {
  applyAppearance,
  applyReduceMotion,
  applyTheme,
  isSkinId,
  type SkinId,
  type ThemeMode,
} from "../services/theme";
import { detectRankUp, type RankUpMoment } from "../services/rankMoments";
import { isSoundCueSet, playSfx, type SoundCueSet } from "../services/sfx";

const PREFS_KEY = "bbi.prefs";
const FAV_KEY = "bbi.favorites";

/** Tracked-decklist display style on My Stats (v2.0). */
export type DecklistView = "stacked" | "list" | "compact";

/** Pages allowed as the launch landing page (main nav only). */
export const LANDING_PAGES: Page[] = [
  "daily",
  "stats",
  "climb",
  "matchups",
  "brewlab",
  "sets",
  "formats",
  "meta",
];

interface Prefs {
  defaultMode: PlayMode;
  /** Tray / desktop notify the day before an Arena set drop */
  notifyArenaEve: boolean;
  /** Desktop toast when a match is recorded (default on). */
  notifyMatchEnd: boolean;
  /**
   * Mirror alerts into a top-most window (default on). Windows mutes OS
   * banners while a game or any app is fullscreen — this is the surface that
   * still reaches you mid-match.
   */
  notifyTopmost: boolean;
  /** Desktop toast when a B&R announcement changes the ban lists (default on). */
  notifyBanlist: boolean;
  /** Tray ping when daily meta board moves (rose / new on board). */
  notifyMetaMovers: boolean;
  /**
   * Opt-in parser-health ping (default **OFF**). Sends a random install id,
   * app/parser version, OS, and whether log parsing is failing — once a day,
   * nothing else. It is the only way to see an Arena update break the parser
   * before users do. See `docs/BACKEND-PHASE-2.md` §7.1.
   */
  healthPing: boolean;
  /** Always-on-top match HUD during Arena games (default on). */
  overlayEnabled: boolean;
  /**
   * Corner badge while Arena is open (default on) — proves the app is running
   * on the home screen and in the deck builder, where the HUD never shows.
   */
  presenceEnabled: boolean;
  /** Overlay panel background opacity (0.55–1, default 0.92). */
  overlayOpacity: number;
  /** Overlay starts expanded (full list) instead of collapsed bar. */
  overlayStartExpanded: boolean;
  /** Overlay ignores mouse input — purely passive HUD (default off). */
  overlayClickThrough: boolean;
  /**
   * Soft match / rank-up UI sounds in the main app (default OFF).
   * Never plays in the overlay webview.
   */
  soundEnabled: boolean;
  /** Which synthesized cue set to use when sound is on. */
  soundCueSet: SoundCueSet;
  /** Collapsed overlay bar: show the match clock (default on). */
  overlayBarClock: boolean;
  /** Collapsed overlay bar: show season record with this deck (default on). */
  overlayBarRecord: boolean;
  /** Post-match summary card lingers in the overlay after win/loss (default on). */
  overlayPostMatch: boolean;
  /** Overlay list density — cozy / compact / minimal (default compact). */
  overlayDensity: OverlayDensity;
  /** Overlay fades quieter while the mouse is elsewhere (default on). */
  overlayIdleDim: boolean;
  /** Tracked-decklist display style on My Stats (default stacked — compact). */
  decklistView: DecklistView;
  /** Climb path list order — newest stretch on top (default on). */
  climbNewestFirst: boolean;
  /** Page the app opens on at launch (main nav pages only). */
  defaultPage: Page;
  /** Tone down UI animation (count-ups, pulses, transitions). */
  reduceMotion: boolean;
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
        notifyTopmost?: boolean;
        notifyBanlist?: boolean;
        notifyMetaMovers?: boolean;
        healthPing?: boolean;
        overlayEnabled?: boolean;
        presenceEnabled?: boolean;
        overlayOpacity?: number;
        overlayStartExpanded?: boolean;
        overlayClickThrough?: boolean;
        overlayBarClock?: boolean;
        overlayBarRecord?: boolean;
        overlayPostMatch?: boolean;
        overlayDensity?: string;
        overlayIdleDim?: boolean;
        decklistView?: string;
        climbNewestFirst?: boolean;
        defaultPage?: string;
        reduceMotion?: boolean;
        soundEnabled?: boolean;
        soundCueSet?: string;
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
        notifyTopmost: parsed.notifyTopmost !== false,
        notifyBanlist: parsed.notifyBanlist !== false,
        notifyMetaMovers: parsed.notifyMetaMovers !== false,
        // Opt-in: only true when explicitly turned on (=== true, not !== false).
        healthPing: parsed.healthPing === true,
        overlayEnabled: parsed.overlayEnabled !== false,
        presenceEnabled: parsed.presenceEnabled !== false,
        overlayOpacity: normalizeOpacity(parsed.overlayOpacity),
        overlayStartExpanded: parsed.overlayStartExpanded === true,
        overlayClickThrough: parsed.overlayClickThrough === true,
        overlayBarClock: parsed.overlayBarClock !== false,
        overlayBarRecord: parsed.overlayBarRecord !== false,
        overlayPostMatch: parsed.overlayPostMatch !== false,
        overlayDensity: normalizeDensity(parsed.overlayDensity),
        overlayIdleDim: parsed.overlayIdleDim !== false,
        decklistView:
          parsed.decklistView === "list" || parsed.decklistView === "compact"
            ? parsed.decklistView
            : "stacked",
        climbNewestFirst: parsed.climbNewestFirst !== false,
        defaultPage: LANDING_PAGES.includes(parsed.defaultPage as Page)
          ? (parsed.defaultPage as Page)
          : "daily",
        reduceMotion: parsed.reduceMotion === true,
        // Sound is opt-in — OFF by default (owner: bad sound ruins an app).
        soundEnabled: parsed.soundEnabled === true,
        soundCueSet: isSoundCueSet(parsed.soundCueSet) ? parsed.soundCueSet : "soft",
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
    notifyTopmost: true,
    notifyBanlist: true,
    notifyMetaMovers: true,
    healthPing: false,
    overlayEnabled: true,
    presenceEnabled: true,
    overlayOpacity: 0.92,
    overlayStartExpanded: false,
    overlayClickThrough: false,
    overlayBarClock: true,
    overlayBarRecord: true,
    overlayPostMatch: true,
    overlayDensity: "compact",
    overlayIdleDim: true,
    decklistView: "stacked",
    climbNewestFirst: true,
    defaultPage: "daily",
    reduceMotion: false,
    soundEnabled: false,
    soundCueSet: "soft",
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
  /** B1-suggested archetype tag for the nudged opponent (or null). */
  tagNudgeSuggested: string | null;
  clearTagNudge: () => void;
  /** Latest rank-up moment (ladder climb) — shown once in the main app. */
  rankUpMoment: RankUpMoment | null;
  clearRankUpMoment: () => void;
  /** Climb focus: highlight a tracker deck on the climb path. */
  climbFocusDeckKey: string | null;
  openClimbDeck: (trackerDeckKey: string) => void;
  clearClimbFocus: () => void;
  /** Brew Lab focus: open the clinic with a tracked deck pre-selected. */
  brewLabFocusDeckKey: string | null;
  openBrewLabDeck: (trackerDeckKey: string) => void;
  clearBrewLabFocus: () => void;
  /** Brew Lab seed: open the paste clinic pre-filled with an Arena list. */
  brewLabSeedText: string | null;
  openBrewLabText: (arenaImport: string) => void;
  clearBrewLabSeed: () => void;
  /** Help center modal (v2.0) — openable from anywhere. */
  helpOpen: boolean;
  setHelpOpen: (v: boolean) => void;
  setDefaultMode: (m: PlayMode) => void;
  setNotifyArenaEve: (v: boolean) => void;
  setNotifyMatchEnd: (v: boolean) => void;
  setNotifyTopmost: (v: boolean) => void;
  setNotifyBanlist: (v: boolean) => void;
  setNotifyMetaMovers: (v: boolean) => void;
  /**
   * Opt in/out of the parser-health ping. Turning it OFF deletes the local
   * install id, so re-enabling mints a fresh one rather than resuming.
   */
  setHealthPing: (v: boolean) => void;
  setOverlayEnabled: (v: boolean) => void;
  setPresenceEnabled: (v: boolean) => void;
  /** Overlay panel opacity (0.55–1) — read live by the overlay window. */
  setOverlayOpacity: (v: number) => void;
  /** Start overlay expanded instead of collapsed bar. */
  setOverlayStartExpanded: (v: boolean) => void;
  /** Overlay ignores mouse input (passive HUD) — re-applied live. */
  setOverlayClickThrough: (v: boolean) => void;
  /** Collapsed overlay bar: match clock on/off. */
  setOverlayBarClock: (v: boolean) => void;
  /** Collapsed overlay bar: season record on/off. */
  setOverlayBarRecord: (v: boolean) => void;
  /** Post-match summary card in the overlay after win/loss. */
  setOverlayPostMatch: (v: boolean) => void;
  setOverlayDensity: (v: OverlayDensity) => void;
  setOverlayIdleDim: (v: boolean) => void;
  /** Tracked-decklist display style (My Stats deck detail). */
  setDecklistView: (v: DecklistView) => void;
  /** Climb path order — newest stretch on top. */
  setClimbNewestFirst: (v: boolean) => void;
  /** Launch landing page. */
  setDefaultPage: (p: Page) => void;
  /** Tone down UI animation. */
  setReduceMotion: (v: boolean) => void;
  /**
   * Re-read the prefs blob from localStorage into the store. The overlay's
   * quick-settings pill writes prefs directly and emits `prefs:overlay` —
   * the main window calls this so Settings sliders stay honest.
   */
  reloadPrefs: () => void;
  /** Opt-in UI sound (main app only). */
  setSoundEnabled: (v: boolean) => void;
  /** Which cue set to play when sound is enabled. */
  setSoundCueSet: (v: SoundCueSet) => void;
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

/**
 * True when two tracker snapshots are field-for-field identical, so the 12s
 * safety poll can skip `set()` and spare every tracker-aware page a re-render
 * with a fresh array reference.
 *
 * Compares *every* match shallowly rather than sampling endpoints: matches are
 * edited in place (opponent tags, deck reassignment, corrected results), and a
 * first/last-only check treats those as "no change" and strands the UI.
 */
function sameMatchList(a: TrackedMatch[], b: TrackedMatch[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] as unknown as Record<string, unknown>;
    const y = b[i] as unknown as Record<string, unknown>;
    if (x === y) continue;
    const kx = Object.keys(x);
    if (kx.length !== Object.keys(y).length) return false;
    for (const k of kx) {
      const vx = x[k];
      const vy = y[k];
      if (vx === vy) continue;
      // One level deeper for the nested game/rank objects the tracker attaches.
      if (
        vx && vy && typeof vx === "object" && typeof vy === "object" &&
        JSON.stringify(vx) === JSON.stringify(vy)
      ) {
        continue;
      }
      return false;
    }
  }
  return true;
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
  applyReduceMotion(prefs.reduceMotion);
  // The test-only meta URL override was removed in 0.8.3 — clear any leftover.
  try {
    localStorage.removeItem("bbi.metaUrl");
  } catch {
    /* ignore */
  }
  return {
    page: prefs.defaultPage,
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
    tagNudgeSuggested: null,
    rankUpMoment: null,
    climbFocusDeckKey: null,
    brewLabFocusDeckKey: null,
    brewLabSeedText: null,
    helpOpen: false,
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

    // Note: do NOT wrap these in startTransition. Zustand reaches React through
    // `useSyncExternalStore`, and React always renders external-store updates
    // synchronously — the wrapper deferred nothing and only hid that fact. Page
    // chunks are kept warm by App's idle prefetch instead.
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
        tagNudgeSuggested: null,
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
    clearTagNudge: () => set({ tagNudgeOpponent: null, tagNudgeSuggested: null }),
    clearRankUpMoment: () => set({ rankUpMoment: null }),
    openClimbDeck: (trackerDeckKey) =>
      set({
        climbFocusDeckKey: trackerDeckKey,
        page: "climb",
      }),
    clearClimbFocus: () => set({ climbFocusDeckKey: null }),
    openBrewLabDeck: (trackerDeckKey) =>
      set({ brewLabFocusDeckKey: trackerDeckKey, page: "brewlab" }),
    clearBrewLabFocus: () => set({ brewLabFocusDeckKey: null }),
    openBrewLabText: (arenaImport) =>
      set({
        brewLabSeedText: arenaImport,
        brewLabFocusDeckKey: null,
        page: "brewlab",
      }),
    clearBrewLabSeed: () => set({ brewLabSeedText: null }),
    setHelpOpen: (helpOpen) => set({ helpOpen }),
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
      // Rust posts this toast itself (works tray-hidden) — keep it in sync.
      void setNotifyMatchEndRust(notifyMatchEnd);
    },
    setNotifyTopmost: (notifyTopmost) => {
      const next = { ...get().prefs, notifyTopmost };
      savePrefs(next);
      set({ prefs: next });
      // Rust owns the top-most window — mirror the toggle across.
      void setTopmostToastEnabled(notifyTopmost);
    },
    setNotifyBanlist: (notifyBanlist) => {
      const next = { ...get().prefs, notifyBanlist };
      savePrefs(next);
      set({ prefs: next });
    },
    setNotifyMetaMovers: (notifyMetaMovers) => {
      const next = { ...get().prefs, notifyMetaMovers };
      savePrefs(next);
      set({ prefs: next });
    },
    setHealthPing: (healthPing) => {
      const next = { ...get().prefs, healthPing };
      savePrefs(next);
      set({ prefs: next });
      if (healthPing) {
        // Send immediately so the toggle visibly does something, rather than
        // waiting for the next launch.
        void import("../services/cloud/healthPing").then((m) =>
          m.maybeSendHealthPing({
            enabled: true,
            status: get().trackerStatus,
            matches: get().trackerMatches,
          }),
        );
      } else {
        // Opting out is a reset, not a pause: drop the install id entirely.
        void import("../services/cloud/healthPing").then((m) => m.forgetInstall());
      }
    },
    setOverlayEnabled: (overlayEnabled) => {
      const next = { ...get().prefs, overlayEnabled };
      savePrefs(next);
      set({ prefs: next });
      void setOverlayEnabledRust(overlayEnabled);
    },
    setPresenceEnabled: (presenceEnabled) => {
      const next = { ...get().prefs, presenceEnabled };
      savePrefs(next);
      set({ prefs: next });
      // Rust owns the badge window (the Arena watcher drives show/hide).
      void setPresenceEnabledRust(presenceEnabled);
    },
    setOverlayOpacity: (overlayOpacity) => {
      const next = { ...get().prefs, overlayOpacity: normalizeOpacity(overlayOpacity) };
      savePrefs(next);
      set({ prefs: next });
      void pushOverlayPrefs();
    },
    setOverlayStartExpanded: (overlayStartExpanded) => {
      const next = { ...get().prefs, overlayStartExpanded };
      savePrefs(next);
      set({ prefs: next });
      void pushOverlayPrefs();
      // Mirror into disk geometry so the next match / restart uses this mode
      // (size is preserved; only the expanded flag flips).
      if (isTauri()) {
        void (async () => {
          try {
            const geo = await invoke<{
              x: number;
              y: number;
              width: number;
              height: number;
              expanded?: boolean;
            } | null>("overlay_get_geometry");
            if (!geo) return;
            await invoke("overlay_save_geometry", {
              geometry: { ...geo, expanded: overlayStartExpanded },
            });
          } catch {
            /* ignore */
          }
        })();
      }
    },
    setOverlayClickThrough: (overlayClickThrough) => {
      const next = { ...get().prefs, overlayClickThrough };
      savePrefs(next);
      set({ prefs: next });
      void pushOverlayPrefs();
    },
    setOverlayBarClock: (overlayBarClock) => {
      const next = { ...get().prefs, overlayBarClock };
      savePrefs(next);
      set({ prefs: next });
      void pushOverlayPrefs();
    },
    setOverlayBarRecord: (overlayBarRecord) => {
      const next = { ...get().prefs, overlayBarRecord };
      savePrefs(next);
      set({ prefs: next });
      void pushOverlayPrefs();
    },
    setOverlayPostMatch: (overlayPostMatch) => {
      const next = { ...get().prefs, overlayPostMatch };
      savePrefs(next);
      set({ prefs: next });
      void pushOverlayPrefs();
      // Rust owns the linger window (12s vs short flash) — keep it in sync.
      void setOverlayPostMatchRust(overlayPostMatch);
    },
    setOverlayDensity: (overlayDensity) => {
      const next = { ...get().prefs, overlayDensity };
      savePrefs(next);
      set({ prefs: next });
      void pushOverlayPrefs();
    },
    setOverlayIdleDim: (overlayIdleDim) => {
      const next = { ...get().prefs, overlayIdleDim };
      savePrefs(next);
      set({ prefs: next });
      void pushOverlayPrefs();
    },
    setDecklistView: (decklistView) => {
      const next = { ...get().prefs, decklistView };
      savePrefs(next);
      set({ prefs: next });
    },
    setClimbNewestFirst: (climbNewestFirst) => {
      const next = { ...get().prefs, climbNewestFirst };
      savePrefs(next);
      set({ prefs: next });
    },
    setDefaultPage: (defaultPage) => {
      const next = { ...get().prefs, defaultPage };
      savePrefs(next);
      set({ prefs: next });
    },
    setReduceMotion: (reduceMotion) => {
      const next = { ...get().prefs, reduceMotion };
      savePrefs(next);
      set({ prefs: next });
      applyReduceMotion(reduceMotion);
    },
    reloadPrefs: () => {
      const next = loadPrefs();
      set({ prefs: next });
      applyReduceMotion(next.reduceMotion);
    },
    setSoundEnabled: (soundEnabled) => {
      const next = { ...get().prefs, soundEnabled };
      savePrefs(next);
      set({ prefs: next });
    },
    setSoundCueSet: (soundCueSet) => {
      const next = { ...get().prefs, soundCueSet };
      savePrefs(next);
      set({ prefs: next });
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
      void pushOverlayPrefs();
    },
    setSkin: (skin) => {
      const next = { ...get().prefs, skin };
      savePrefs(next);
      set({ prefs: next });
      applyAppearance(next.theme, skin);
      void pushOverlayPrefs();
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
      // Preferred: signed Tauri updater (minisign + plugin).
      const signed = await checkAppUpdateSigned();
      if (signed.ok && signed.update) {
        const auto = signed.update;
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
      // The signed updater answered and we're current — believe it. Consulting
      // version.json here would only offer a weaker path to the same answer.
      if (signed.ok) {
        set({ updateAvailable: null });
        return { status: "latest", remote: { version: APP_VERSION } };
      }
      // Signed check unavailable (offline, bad manifest). version.json can
      // still *tell* us an update exists, but it cannot authorise installing
      // one — the user is sent to the download page to run it themselves.
      const result = await checkRemoteVersion();
      set({
        updateAvailable: resolveUpdateOffer(
          signed,
          result.status === "update" ? result.remote : null,
        ),
      });
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
        // Skip the set when nothing changed — the 12s safety poll otherwise
        // forces every tracker-aware page (Daily, Stats, Matchups, …) to
        // re-render with a brand-new array reference for no reason.
        const prev = get();
        const prevS = prev.trackerStatus;
        const sameStatus =
          (status == null && prevS == null) ||
          (status != null &&
            prevS != null &&
            prevS.logPath === status.logPath &&
            prevS.logFound === status.logFound &&
            prevS.detailedLogs === status.detailedLogs &&
            prevS.lastEventAt === status.lastEventAt &&
            prevS.matchesRecorded === status.matchesRecorded &&
            prevS.parseErrors === status.parseErrors &&
            prevS.localPlayer === status.localPlayer &&
            prevS.backfillDone === status.backfillDone);
        // Every match, not just the endpoints: a first/last-only sample misses
        // in-place edits (an opponent tag, a deck reassignment, a corrected
        // result) whenever the list length is unchanged, and the UI would then
        // never show them. A few hundred shallow compares every 12s is free.
        const sameMatches = sameMatchList(prev.trackerMatches, matches);
        if (sameStatus && sameMatches) return;
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
      // Self-heal pref drift on boot: localStorage is the UI source of truth;
      // Rust mirrors both flags (it posts the toast / owns the linger window).
      void setNotifyMatchEndRust(get().prefs.notifyMatchEnd);
      // Always on: the top-most card is the only surface alerts have now, so
      // the old "show over fullscreen Arena" toggle would just be a silent
      // kill switch. Anyone who had it off keeps their per-alert toggles.
      void setTopmostToastEnabled(true);
      void setOverlayPostMatchRust(get().prefs.overlayPostMatch);
      void setPresenceEnabledRust(get().prefs.presenceEnabled);
      await get().refreshTracker();
      await subscribeTracker({
        onMatch: (m) => {
          const cur = get().trackerMatches;
          if (cur.some((x) => x.matchId === m.matchId)) return;
          const rankUp = detectRankUp(m, cur);
          const prevCount = cur.length;
          set({
            trackerMatches: [m, ...cur],
            // M2: offer tagging when we know the opponent name
            tagNudgeOpponent: m.opponentName?.trim() || get().tagNudgeOpponent,
            rankUpMoment: rankUp ?? get().rankUpMoment,
          });
          // D1: one-shot first-match celebration toast
          void import("../services/firstMatchCelebrate").then((mod) => {
            if (mod.shouldCelebrateFirstMatch(prevCount, prevCount + 1)) {
              void notifyDesktop(
                "You're live",
                "First match recorded on this PC. Open My Stats for your record.",
              );
              mod.markFirstMatchCelebrated();
            }
          });
          // B1 accept-tag: async suggestion when cards were seen
          if (m.opponentName?.trim() && (m.opponentSeen?.length ?? 0) > 0) {
            void (async () => {
              try {
                const { suggestOpponentTag } = await import("../services/tagSuggest");
                const { peekSeenCard, resolveArenaMetaBatch } = await import(
                  "../services/arenaMeta"
                );
                await resolveArenaMetaBatch(m.opponentSeen ?? []);
                const meta = get().meta;
                const { inferenceCandidatesFromBundle } = await import(
                  "../services/deckHelpers"
                );
                const mode = (m.bestOf ?? 1) >= 3 ? "bo3" : "bo1";
                const candidates = inferenceCandidatesFromBundle(meta, mode);
                const s = suggestOpponentTag(
                  m,
                  (id) => peekSeenCard(id),
                  candidates,
                );
                if (
                  s &&
                  get().tagNudgeOpponent === s.opponentName
                ) {
                  set({ tagNudgeSuggested: s.archetype });
                }
              } catch {
                /* ignore */
              }
            })();
          }
          // Soft match-end + rank-up cues (main app only; opt-in).
          const prefs = get().prefs;
          if (prefs.soundEnabled) {
            const set = prefs.soundCueSet;
            if (rankUp) {
              void playSfx("rankup", { set });
            } else if (m.result === "win") {
              void playSfx("win", { set });
            } else if (m.result === "loss") {
              void playSfx("loss", { set });
            } else if (m.result === "draw") {
              void playSfx("draw", { set });
            }
          }
          // Match-end toast. In the desktop app the tracker thread posts it
          // itself (immune to tray-hidden webview + Focus Assist queues it);
          // this JS path remains for browser/dev only.
          if (prefs.notifyMatchEnd && !isTauri()) {
            const history = [m, ...cur];
            void (async () => {
              const { matchEndToastBody } = await import("../services/matchNotify");
              const { peekSeenCard } = await import("../services/arenaMeta");
              const meta = get().meta;
              const { inferenceCandidatesFromBundle } = await import(
                "../services/deckHelpers"
              );
              const mode = (m.bestOf ?? 1) >= 3 ? "bo3" : "bo1";
              const candidates = inferenceCandidatesFromBundle(meta, mode);
              const body = matchEndToastBody(m, history, {
                resolveName: (grpId) => peekSeenCard(grpId),
                candidates,
              });
              await notifyDesktop("Filthy Net Deck", body);
            })();
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
        // One-shot meta-mover toast (rose / new on board) when opted in.
        if (get().prefs.notifyMetaMovers && diff.changes.length) {
          const body = summarizeMetaMovers(diff.changes);
          if (body) {
            const sig = metaMoverSignature(bundle.date, diff.changes);
            if (shouldFireMetaMoverNotify(sig)) {
              void notifyDesktop("Meta board moved", `${body}. Open Daily for the full board.`);
              markMetaMoverNotifyFired(sig);
            }
          }
        }
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
