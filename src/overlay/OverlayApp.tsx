import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { LiveCardCount, LiveMatch, TrackedMatch } from "../types/tracker";
import { deckKey, seasonKeyOf, currentSeasonKey } from "../services/tracker";
import { bootThemeFromStorage } from "../services/theme";
import {
  peekArenaMeta,
  resolveArenaMetaBatch,
  type ArenaCardMeta,
} from "../services/arenaMeta";
import { isTauri } from "../services/appUpdater";
import {
  drawPct,
  formatClock,
  groupLibrary,
  groupSeenCards,
  matchupHudLine,
  normalizeDensity,
  normalizeOpacity,
  opponentCardsSeenCount,
  parseManaCost,
  pipText,
  pipTone,
  playDrawLabel,
  type OverlayDensity,
  type OverlayGroup,
  type OverlayRow,
} from "./overlayModel";
import { inferOpponentArchetype } from "../services/opponentArchetype";
import { deckMatchupMatrix } from "../services/gameAnalytics";
import { decksForMode } from "../services/deckHelpers";
import type { MetaBundle } from "../types/meta";
import { PostMatchSummary } from "./PostMatchSummary";


const SNAP_PX = 24;
/** Collapsed = accent line + title bar only. Keep in sync with the CSS bar height. */
const COLLAPSED_H = 34;
/** Expanded window never goes below this when restoring. */
const MIN_EXPANDED_H = 120;
/** Grow the panel to at least this tall while the post-match summary is up. */
const SUMMARY_MIN_H = 252;
/** localStorage prefs blob shared with the main window (same origin). */
const PREFS_KEY = "bbi.prefs";


function loadMetaCache(): MetaBundle | null {
  try {
    const raw = localStorage.getItem("bbi.meta.lastGood");
    if (!raw) return null;
    const data = JSON.parse(raw) as MetaBundle;
    if (!data?.formats?.length || !data.decks) return null;
    return data;
  } catch {
    return null;
  }
}

function seasonRecord(
  matches: TrackedMatch[],
  live: LiveMatch | null,
): { wins: number; losses: number; wr: number | null } {
  if (!live) return { wins: 0, losses: 0, wr: null };
  const season = currentSeasonKey();
  const key = live.deckId ?? live.deckName ?? live.deckHash ?? null;
  const relevant = matches.filter((m) => {
    if (seasonKeyOf(m.endedAt) !== season) return false;
    if (m.result !== "win" && m.result !== "loss") return false;
    if (!key) return false;
    return deckKey(m) === key || m.deckHash === live.deckHash;
  });
  const wins = relevant.filter((m) => m.result === "win").length;
  const losses = relevant.filter((m) => m.result === "loss").length;
  const decided = wins + losses;
  return {
    wins,
    losses,
    wr: decided ? Math.round((wins / decided) * 100) : null,
  };
}

/** Overlay display prefs shared with the main window (Settings ⇄ pill menu). */
interface OverlayPrefs {
  opacity: number;
  startExpanded: boolean;
  clickThrough: boolean;
  barClock: boolean;
  barRecord: boolean;
  postMatch: boolean;
  /** Row density of the expanded list — footprint knob (default compact). */
  density: OverlayDensity;
  /** Fade the panel quieter while the mouse is elsewhere (default on). */
  idleDim: boolean;
}

function readOverlayPrefs(): OverlayPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        overlayOpacity?: number;
        overlayStartExpanded?: boolean;
        overlayClickThrough?: boolean;
        overlayBarClock?: boolean;
        overlayBarRecord?: boolean;
        overlayPostMatch?: boolean;
        overlayDensity?: string;
        overlayIdleDim?: boolean;
      };
      return {
        opacity: normalizeOpacity(parsed.overlayOpacity),
        startExpanded: parsed.overlayStartExpanded === true,
        clickThrough: parsed.overlayClickThrough === true,
        barClock: parsed.overlayBarClock !== false,
        barRecord: parsed.overlayBarRecord !== false,
        postMatch: parsed.overlayPostMatch !== false,
        density: normalizeDensity(parsed.overlayDensity),
        idleDim: parsed.overlayIdleDim !== false,
      };
    }
  } catch {
    /* ignore */
  }
  return {
    opacity: normalizeOpacity(undefined),
    startExpanded: false,
    clickThrough: false,
    barClock: true,
    barRecord: true,
    postMatch: true,
    density: normalizeDensity(undefined),
    idleDim: true,
  };
}

/**
 * Merge a patch into the shared prefs blob and broadcast `prefs:overlay` so
 * the main window's Settings mirror it live (no alt-tab needed). The emit is
 * lightly debounced — the opacity slider fires per pixel.
 */
let prefsEmitTimer = 0;
function writeOverlayPrefs(patch: Record<string, unknown>): void {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    const obj = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    Object.assign(obj, patch);
    localStorage.setItem(PREFS_KEY, JSON.stringify(obj));
  } catch {
    /* ignore */
  }
  if (!isTauri()) return;
  window.clearTimeout(prefsEmitTimer);
  prefsEmitTimer = window.setTimeout(() => {
    void (async () => {
      try {
        const { emit } = await import("@tauri-apps/api/event");
        await emit("prefs:overlay");
      } catch {
        /* ignore */
      }
    })();
  }, 120);
}

/** Passive-HUD mode: make this window ignore cursor events (clicks fall through). */
async function applyClickThrough(ignore: boolean) {
  if (!isTauri()) return;
  try {
    await invoke("overlay_set_click_through", { ignore });
  } catch {
    /* older builds without the command */
  }
}

/** Keep the Rust linger window in sync with the post-match toggle. */
async function applyPostMatch(enabled: boolean) {
  if (!isTauri()) return;
  try {
    await invoke("overlay_set_post_match", { enabled });
  } catch {
    /* older builds without the command */
  }
}

async function persistGeometry(heightOverride?: number) {
  if (!isTauri()) return;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    const pos = await win.outerPosition();
    const size = await win.outerSize();
    const factor = await win.scaleFactor();
    await invoke("overlay_save_geometry", {
      geometry: {
        x: pos.x / factor,
        y: pos.y / factor,
        width: size.width / factor,
        // Collapsed height is transient — keep the expanded height on disk.
        height: heightOverride ?? size.height / factor,
      },
    });
  } catch {
    /* ignore */
  }
}

async function snapToEdges(heightOverride?: number) {
  if (!isTauri()) return;
  try {
    const {
      getCurrentWindow,
      LogicalPosition,
      currentMonitor,
      primaryMonitor,
    } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    const factor = await win.scaleFactor();
    const pos = await win.outerPosition();
    const size = await win.outerSize();
    const monitor = (await currentMonitor()) ?? (await primaryMonitor());
    if (!monitor) return;

    const mx = monitor.position.x;
    const my = monitor.position.y;
    const mw = monitor.size.width;
    const mh = monitor.size.height;

    let x = pos.x;
    let y = pos.y;
    const right = mx + mw - size.width;
    const bottom = my + mh - size.height;
    const thr = SNAP_PX * factor;

    if (Math.abs(x - mx) <= thr) x = mx;
    else if (Math.abs(x - right) <= thr) x = right;
    if (Math.abs(y - my) <= thr) y = my;
    else if (Math.abs(y - bottom) <= thr) y = bottom;

    if (x !== pos.x || y !== pos.y) {
      await win.setPosition(new LogicalPosition(x / factor, y / factor));
    }
    await persistGeometry(heightOverride);
  } catch {
    /* ignore */
  }
}

/** Clamp the window fully inside the monitor (used after expanding). */
async function ensureOnScreen() {
  if (!isTauri()) return;
  try {
    const {
      getCurrentWindow,
      LogicalPosition,
      currentMonitor,
      primaryMonitor,
    } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    const factor = await win.scaleFactor();
    const pos = await win.outerPosition();
    const size = await win.outerSize();
    const monitor = (await currentMonitor()) ?? (await primaryMonitor());
    if (!monitor) return;

    const maxX = monitor.position.x + monitor.size.width - size.width;
    const maxY = monitor.position.y + monitor.size.height - size.height;
    const x = Math.min(Math.max(pos.x, monitor.position.x), Math.max(monitor.position.x, maxX));
    const y = Math.min(Math.max(pos.y, monitor.position.y), Math.max(monitor.position.y, maxY));
    if (x !== pos.x || y !== pos.y) {
      await win.setPosition(new LogicalPosition(x / factor, y / factor));
    }
  } catch {
    /* ignore */
  }
}

function useArenaMetaMap(rawIds: number[]) {
  const [tick, setTick] = useState(0);
  const key = useMemo(
    () =>
      [...new Set(rawIds)]
        .sort((a, b) => a - b)
        .join(","),
    [rawIds],
  );
  const ids = useMemo(
    () => (key ? key.split(",").map(Number) : []),
    [key],
  );

  useEffect(() => {
    let cancelled = false;
    const missing = ids.filter((id) => peekArenaMeta(id) === undefined);
    // Force re-render when cache already has hits.
    setTick((t) => t + 1);
    if (!missing.length) return;
    void resolveArenaMetaBatch(missing, 2).then(() => {
      if (!cancelled) setTick((t) => t + 1);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return useMemo(() => {
    const map = new Map<number, ArenaCardMeta | null>();
    for (const id of ids) {
      const m = peekArenaMeta(id);
      if (m !== undefined) map.set(id, m);
    }
    return map;
    // tick forces refresh after async resolves
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);
}

const ManaPips = memo(function ManaPips({
  cost,
}: {
  cost: string | null | undefined;
}) {
  const symbols = useMemo(() => parseManaCost(cost), [cost]);
  // Absurdly long costs (e.g. {2}{G}{G}{G}{G}{G}) skip pips — the row stays clean.
  if (symbols.length === 0 || symbols.length > 5) return null;
  return (
    <span className="overlay-pips" aria-hidden="true">
      {symbols.map((s, i) => (
        <span key={i} className={`overlay-pip pip-${pipTone(s)}`}>
          {pipText(s)}
        </span>
      ))}
    </span>
  );
});

type RowProps = {
  card: LiveCardCount;
  meta: ArenaCardMeta | null | undefined;
  libraryTotal: number;
  /** 0–1 heat of the draw odds relative to the best draw in the list. */
  intensity: number;
};

const CardRow = memo(function CardRow({ card, meta, libraryTotal, intensity }: RowProps) {
  const label = meta?.name ?? `Card ${card.grpId}`;
  const pct = drawPct(card.remaining, libraryTotal);
  const art = meta?.artUrl;
  return (
    <li
      className={`overlay-card-row${meta?.isLand ? " is-land" : ""}`}
      style={{ "--int": intensity.toFixed(3) } as CSSProperties}
    >
      <span className="overlay-card-qty">{card.remaining}</span>
      {art ? (
        <img
          className="overlay-card-art"
          src={art}
          alt=""
          width={30}
          height={42}
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      ) : (
        <span className="overlay-card-art overlay-card-art--empty" />
      )}
      <span className="overlay-card-name" title={label}>
        {label}
      </span>
      <ManaPips cost={meta?.manaCost} />
      <span className="overlay-card-pct" title="Chance this is the next card drawn">
        {pct != null ? `${pct}%` : "—"}
      </span>
    </li>
  );
});

const GroupSection = memo(function GroupSection({
  group,
  libraryTotal,
  maxPct,
}: {
  group: OverlayGroup;
  libraryTotal: number;
  maxPct: number;
}) {
  return (
    <section className={`overlay-group overlay-group--${group.id}`}>
      <header className="overlay-group-head" data-tauri-drag-region>
        <span className="overlay-group-label">{group.label}</span>
        <span className="overlay-group-count">{group.remaining}</span>
      </header>
      <ul className="overlay-group-list">
        {group.rows.map(({ card, meta }) => {
          const pct = drawPct(card.remaining, libraryTotal) ?? 0;
          return (
            <CardRow
              key={card.grpId}
              card={card}
              meta={meta}
              libraryTotal={libraryTotal}
              intensity={maxPct > 0 ? pct / maxPct : 0}
            />
          );
        })}
      </ul>
    </section>
  );
});

/** Opponent-seen row: art · name · pips. No qty/draw% — we only know "shown". */
const SeenRow = memo(function SeenRow({ row }: { row: OverlayRow }) {
  const label = row.meta?.name ?? `Card ${row.card.grpId}`;
  const art = row.meta?.artUrl;
  return (
    <li className={`overlay-card-row is-seen${row.meta?.isLand ? " is-land" : ""}`}>
      {art ? (
        <img
          className="overlay-card-art"
          src={art}
          alt=""
          width={30}
          height={42}
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      ) : (
        <span className="overlay-card-art overlay-card-art--empty" />
      )}
      <span className="overlay-card-name" title={label}>
        {label}
      </span>
      <ManaPips cost={row.meta?.manaCost} />
    </li>
  );
});

const SeenSection = memo(function SeenSection({ group }: { group: OverlayGroup }) {
  return (
    <section className={`overlay-group overlay-group--${group.id}`}>
      <header className="overlay-group-head" data-tauri-drag-region>
        <span className="overlay-group-label">{group.label}</span>
        <span className="overlay-group-count">{group.rows.length}</span>
      </header>
      <ul className="overlay-group-list">
        {group.rows.map((row) => (
          <SeenRow key={row.card.grpId} row={row} />
        ))}
      </ul>
    </section>
  );
});

/**
 * 1 Hz match clock in its own memoized child, so the per-second tick only
 * repaints this span — groups/rows stay untouched (Grok P1-1).
 */
const MatchClock = memo(function MatchClock({
  startedAt,
}: {
  startedAt: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [startedAt]);
  return (
    <span className="overlay-clock" title="Match clock">
      {formatClock(startedAt, now)}
    </span>
  );
});

export function OverlayApp() {
  const [live, setLive] = useState<LiveMatch | null>(null);
  const [matches, setMatches] = useState<TrackedMatch[]>([]);
  /** Default collapsed — far less invasive; expand for full tracker. */
  const [compact, setCompact] = useState(() => !readOverlayPrefs().startExpanded);
  const [prefs, setPrefs] = useState<OverlayPrefs>(() => readOverlayPrefs());
  /** Quick-settings pill menu (footer of the expanded overlay). */
  const [menuOpen, setMenuOpen] = useState(false);
  /** Expanded list panel: my library or the opponent's seen cards. */
  const [view, setView] = useState<"deck" | "opp">("deck");
  /** Idle-dim: true while the cursor is over the panel. */
  const [hot, setHot] = useState(false);
  const dragArmed = useRef(false);
  const liveRaf = useRef(0);
  const pendingLive = useRef<LiveMatch | null | undefined>(undefined);
  /** Expanded height to restore when leaving the collapsed bar. */
  const expandedH = useRef(168);
  /** True while a programmatic collapse/expand resize is in flight. */
  const programmaticResize = useRef(false);
  const compactRef = useRef(compact);
  /**
   * Latest "start expanded" pref. Read at mount and refreshed live via the
   * prefs events; applied when each new match starts (the overlay webview is
   * persistent, so mount-time-only would mean waiting for an app restart).
   */
  const startExpandedRef = useRef(readOverlayPrefs().startExpanded);
  /** matchId the startExpanded pref was last applied to (once per match). */
  const appliedMatchRef = useRef<string | null>(null);
  /** matchId the post-match summary was last auto-shown for (once per match). */
  const appliedSummaryRef = useRef<string | null>(null);
  /** Panel height before the summary grew it — restored on the next match. */
  const preSummaryH = useRef<number | null>(null);

  useEffect(() => {
    compactRef.current = compact;
  }, [compact]);

  useEffect(() => {
    bootThemeFromStorage();
    void applyClickThrough(readOverlayPrefs().clickThrough);
    document.documentElement.classList.add("overlay-root");
    document.body.classList.add("overlay-body");
    // macOS overlay windows can't be transparent (see overlay.rs) — paint the
    // whole webview dark and square off the shell instead of floating corners.
    if (/Mac OS X|Macintosh/.test(navigator.userAgent)) {
      document.documentElement.classList.add("overlay-macos");
    }
    return () => {
      document.documentElement.classList.remove("overlay-root");
      document.body.classList.remove("overlay-body");
      document.documentElement.classList.remove("overlay-macos");
    };
  }, []);

  // Live-follow Settings via the shared prefs blob: opacity slider *and* the
  // chosen Planeswalker skin, so the overlay recolors the instant you switch
  // theme in the main app (no need to restart the match window). This is the
  // fallback path — the reliable cross-webview path is the `prefs:overlay`
  // Tauri event below (DOM `storage` may not fire across WebView2 windows).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== PREFS_KEY) return;
      const p = readOverlayPrefs();
      setPrefs(p);
      startExpandedRef.current = p.startExpanded;
      void applyClickThrough(p.clickThrough);
      bootThemeFromStorage(); // re-apply data-theme + data-skin
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    let unlistenLive: (() => void) | undefined;
    let unlistenPrefs: (() => void) | undefined;
    let unlistenMoved: (() => void) | undefined;
    let unlistenResized: (() => void) | undefined;
    let cancelled = false;
    let snapTimer: number | undefined;

    void (async () => {
      // Plain-browser demo (`/?demo#/overlay`): style the HUD without Arena.
      if (!isTauri() && new URLSearchParams(window.location.search).has("demo")) {
        const { demoLiveMatch, demoMatches } = await import("./demoLive");
        if (!cancelled) {
          setLive(demoLiveMatch());
          setMatches(demoMatches());
        }
        return;
      }
      try {
        const snap = await invoke<LiveMatch | null>("tracker_live");
        if (!cancelled) setLive(snap);
      } catch {
        /* ignore */
      }
      try {
        const hist = await invoke<TrackedMatch[]>("tracker_matches");
        if (!cancelled) setMatches(hist);
      } catch {
        /* ignore */
      }
      try {
        unlistenLive = await listen<LiveMatch | null>("tracker:live", (e) => {
          // Coalesce bursts into one paint per frame (GRE can spike).
          pendingLive.current = e.payload;
          if (!liveRaf.current) {
            liveRaf.current = requestAnimationFrame(() => {
              liveRaf.current = 0;
              const p = pendingLive.current;
              pendingLive.current = undefined;
              if (p === undefined) return;
              setLive(p);
              // History only when match ends — not every draw.
              if (!p || p.phase === "ended") {
                void invoke<TrackedMatch[]>("tracker_matches")
                  .then((hist) => {
                    if (!cancelled) setMatches(hist);
                  })
                  .catch(() => {});
              }
            });
          }
        });
      } catch {
        /* ignore */
      }
      try {
        // Reliable cross-webview prefs push from the main window (opacity,
        // skin, startExpanded) — the `storage` listener above is the fallback.
        unlistenPrefs = await listen("prefs:overlay", () => {
          if (cancelled) return;
          const p = readOverlayPrefs();
          setPrefs(p);
          startExpandedRef.current = p.startExpanded;
          void applyClickThrough(p.clickThrough);
          bootThemeFromStorage();
        });
      } catch {
        /* ignore */
      }

      if (isTauri()) {
        try {
          const { getCurrentWindow, LogicalSize } = await import(
            "@tauri-apps/api/window"
          );
          const win = getCurrentWindow();

          // Remember the expanded height, then honor the collapsed default.
          try {
            const geo = await invoke<{ height: number } | null>(
              "overlay_get_geometry",
            );
            const size = await win.outerSize();
            const factor = await win.scaleFactor();
            expandedH.current = Math.max(
              geo?.height ?? size.height / factor,
              MIN_EXPANDED_H,
            );
            if (compactRef.current) {
              programmaticResize.current = true;
              await win.setSize(
                new LogicalSize(size.width / factor, COLLAPSED_H),
              );
              window.setTimeout(() => {
                programmaticResize.current = false;
              }, 400);
            }
          } catch {
            /* ignore */
          }

          unlistenMoved = await win.onMoved(() => {
            if (!dragArmed.current) return;
            window.clearTimeout(snapTimer);
            snapTimer = window.setTimeout(
              () =>
                void snapToEdges(
                  compactRef.current ? expandedH.current : undefined,
                ),
              140,
            );
          });
          unlistenResized = await win.onResized(() => {
            // Programmatic collapse/expand resizes are not user geometry.
            if (programmaticResize.current) return;
            window.clearTimeout(snapTimer);
            snapTimer = window.setTimeout(
              () =>
                void persistGeometry(
                  compactRef.current ? expandedH.current : undefined,
                ),
              200,
            );
          });
        } catch {
          /* ignore */
        }
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(snapTimer);
      if (liveRaf.current) cancelAnimationFrame(liveRaf.current);
      unlistenLive?.();
      unlistenPrefs?.();
      unlistenMoved?.();
      unlistenResized?.();
    };
  }, []);

  const playing = live?.phase === "playing";

  const record = useMemo(() => seasonRecord(matches, live), [matches, live]);
  // One meta map for both panels: my library and the opponent's seen cards.
  const allIds = useMemo(() => {
    const ids = (live?.library ?? []).map((c) => c.grpId);
    for (const id of live?.opponentSeen ?? []) ids.push(id);
    return ids;
  }, [live?.library, live?.opponentSeen]);
  const metaMap = useArenaMetaMap(allIds);

  const groups = useMemo(
    () => groupLibrary(live?.library ?? [], (id) => metaMap.get(id)),
    [live?.library, metaMap],
  );

  const oppGroups = useMemo(
    () => groupSeenCards(live?.opponentSeen, (id) => metaMap.get(id)),
    [live?.opponentSeen, metaMap],
  );

  const libTotal = live?.libraryTotal ?? 0;

  const maxPct = useMemo(() => {
    let m = 0;
    for (const c of live?.library ?? []) {
      const p = drawPct(c.remaining, libTotal) ?? 0;
      if (p > m) m = p;
    }
    return m;
  }, [live?.library, libTotal]);

  const landStats = useMemo(() => {
    const library = live?.library ?? [];
    let rem = 0;
    let known = false;
    for (const c of library) {
      const m = metaMap.get(c.grpId);
      if (m?.isLand) {
        known = true;
        rem += c.remaining;
      }
    }
    // We only see remaining>0 rows — land count is best-effort.
    return known ? { rem } : null;
  }, [live?.library, metaMap]);

  const onDragHandleDown = useCallback(() => {
    dragArmed.current = true;
  }, []);
  const onDragHandleUp = useCallback(() => {
    window.setTimeout(() => {
      dragArmed.current = false;
      void snapToEdges(compactRef.current ? expandedH.current : undefined);
    }, 80);
  }, []);

  const startResize = useCallback(
    (edge: "East" | "North" | "South" | "West" | "SouthEast") =>
      (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isTauri()) return;
        void (async () => {
          try {
            const { getCurrentWindow } = await import("@tauri-apps/api/window");
            await getCurrentWindow().startResizeDragging(edge);
            window.setTimeout(
              () =>
                void persistGeometry(
                  compactRef.current ? expandedH.current : undefined,
                ),
              200,
            );
          } catch {
            /* ignore */
          }
        })();
      },
    [],
  );

  const setCompactMode = useCallback((next: boolean) => {
    if (next === compactRef.current) return;
    compactRef.current = next;
    setCompact(next);
    // Captured synchronously: a summary-grown height must never become the
    // remembered expanded height when the panel collapses.
    const preGrownH = preSummaryH.current;
    if (!isTauri()) return;
    void (async () => {
      try {
        const { getCurrentWindow, LogicalSize } = await import(
          "@tauri-apps/api/window"
        );
        const win = getCurrentWindow();
        const factor = await win.scaleFactor();
        const size = await win.outerSize();
        const w = size.width / factor;
        const curH = size.height / factor;
        programmaticResize.current = true;
        try {
          if (next) {
            // Collapsing — remember the real expanded height.
            expandedH.current = Math.max(preGrownH ?? curH, MIN_EXPANDED_H);
            await win.setSize(new LogicalSize(w, COLLAPSED_H));
          } else {
            await win.setSize(
              new LogicalSize(w, Math.max(expandedH.current, MIN_EXPANDED_H)),
            );
            await ensureOnScreen();
          }
        } finally {
          window.setTimeout(() => {
            programmaticResize.current = false;
          }, 400);
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const toggleCompact = useCallback(() => {
    setCompactMode(!compactRef.current);
  }, [setCompactMode]);

  /** Pill-menu pref change: persist + broadcast + reflect locally at once. */
  const patchPrefs = useCallback((patch: Record<string, unknown>) => {
    writeOverlayPrefs(patch);
    const p = readOverlayPrefs();
    setPrefs(p);
    startExpandedRef.current = p.startExpanded;
  }, []);

  // Apply the "start expanded" pref once per match — live pref changes are
  // pushed via `prefs:overlay`/storage into startExpandedRef, and take effect
  // here on the next match start (never mid-match, so a manual collapse is
  // not yanked back between Bo3 games).
  const liveMatchId = live?.matchId;
  const livePhase = live?.phase;
  useEffect(() => {
    if (
      livePhase === "playing" &&
      liveMatchId &&
      appliedMatchRef.current !== liveMatchId
    ) {
      appliedMatchRef.current = liveMatchId;
      setCompactMode(!startExpandedRef.current);
      setView("deck");
    }
  }, [liveMatchId, livePhase, setCompactMode]);

  // Post-match summary: once per match, make sure the panel is expanded and
  // tall enough to show the card; restore the user's height when the next
  // match starts. Runs after the startExpanded effect so compactRef is final.
  const summaryOn = livePhase === "ended" && prefs.postMatch;
  useEffect(() => {
    if (summaryOn && liveMatchId) {
      if (appliedSummaryRef.current === liveMatchId) return;
      appliedSummaryRef.current = liveMatchId;
      if (!isTauri()) {
        if (compactRef.current) setCompactMode(false);
        return;
      }
      void (async () => {
        try {
          const { getCurrentWindow, LogicalSize } = await import(
            "@tauri-apps/api/window"
          );
          const win = getCurrentWindow();
          const factor = await win.scaleFactor();
          const size = await win.outerSize();
          const w = size.width / factor;
          const curH = size.height / factor;
          const wasCompact = compactRef.current;
          if (!wasCompact && curH >= SUMMARY_MIN_H) return; // visible + tall enough
          preSummaryH.current = wasCompact ? expandedH.current : curH;
          if (wasCompact) {
            compactRef.current = false;
            setCompact(false);
          }
          programmaticResize.current = true;
          try {
            await win.setSize(
              new LogicalSize(
                w,
                Math.max(wasCompact ? expandedH.current : curH, SUMMARY_MIN_H),
              ),
            );
            await ensureOnScreen();
          } finally {
            window.setTimeout(() => {
              programmaticResize.current = false;
            }, 400);
          }
        } catch {
          /* ignore */
        }
      })();
    } else if (livePhase === "playing" && preSummaryH.current != null) {
      const target = preSummaryH.current;
      preSummaryH.current = null;
      // Collapsed by the startExpanded effect — the collapse path already
      // recorded `target` as the expanded height, nothing to resize.
      if (compactRef.current || !isTauri()) return;
      void (async () => {
        try {
          const { getCurrentWindow, LogicalSize } = await import(
            "@tauri-apps/api/window"
          );
          const win = getCurrentWindow();
          const factor = await win.scaleFactor();
          const size = await win.outerSize();
          programmaticResize.current = true;
          try {
            await win.setSize(new LogicalSize(size.width / factor, target));
          } finally {
            window.setTimeout(() => {
              programmaticResize.current = false;
            }, 400);
          }
        } catch {
          /* ignore */
        }
      })();
    }
  }, [summaryOn, livePhase, liveMatchId, setCompactMode]);

  /** Live archetype guess + personal historical WR on this deck (B4). */
  const oppHud = useMemo(() => {
    // metaMap identity changes as card names resolve — recompute the guess.
    void metaMap;
    if (!live?.opponentSeen?.length) {
      return {
        guess: null as string | null,
        matchup: null as ReturnType<typeof matchupHudLine>,
        seen: opponentCardsSeenCount(live?.opponentSeen),
      };
    }
    const bundle = loadMetaCache();
    const resolveName = (id: number) => peekArenaMeta(id)?.name ?? null;
    const inferOpts = { minHits: 2, minConfidence: 0.35 };

    let guess: string | null = null;
    let candidates: ReturnType<typeof decksForMode> = [];
    if (bundle) {
      const fmt = bundle.formats.find((f) => f.featured) ?? bundle.formats[0];
      if (fmt) {
        const mode = /Traditional/i.test(live.eventId) ? "bo3" : "bo1";
        candidates = decksForMode(fmt, mode as "bo1" | "bo3", bundle.decks);
        const g = inferOpponentArchetype(
          live.opponentSeen,
          resolveName,
          candidates,
          inferOpts,
        );
        guess = g ? g.archetype : null;
      }
    }

    let matchup = null as ReturnType<typeof matchupHudLine>;
    if (guess && candidates.length) {
      const key = live.deckId ?? live.deckName ?? live.deckHash ?? null;
      const sameDeck = matches.filter((m) => {
        if (m.result !== "win" && m.result !== "loss") return false;
        if (!key) return false;
        return deckKey(m) === key || (!!live.deckHash && m.deckHash === live.deckHash);
      });
      const rows = deckMatchupMatrix(sameDeck, resolveName, candidates, inferOpts);
      matchup = matchupHudLine(rows, guess, 2);
    }

    return {
      guess,
      matchup,
      seen: opponentCardsSeenCount(live.opponentSeen),
    };
  }, [live, matches, metaMap]);

  const oppGuessLabel = oppHud.guess;
  const matchupLine = oppHud.matchup;
  const cardsSeen = oppHud.seen;

  if (!live || live.phase === "idle") {
    return <div className="overlay-empty" />;
  }

  const ended = live.phase === "ended";
  const opp = live.opponentName?.trim() || "Opponent";
  const deck = live.deckName?.trim() || "…";
  const resultLabel =
    ended && live.result
      ? live.result === "win"
        ? "Victory"
        : live.result === "loss"
          ? "Defeat"
          : live.result === "draw"
            ? "Draw"
            : "Ended"
      : null;

  const landPct =
    landStats && libTotal > 0
      ? Math.round((landStats.rem / libTotal) * 1000) / 10
      : null;

  const playLabel = playDrawLabel(live.onPlay);

  // Quiet down while the mouse is elsewhere. Never while ended (result should
  // pop) and never with click-through (no hover events would ever wake it).
  const dimmed =
    prefs.idleDim && !hot && !prefs.clickThrough && !menuOpen && !ended;

  const shellClass = [
    "overlay-shell",
    `density-${prefs.density}`,
    ended ? "is-ended" : "",
    ended && live.result ? `is-${live.result}` : "",
    compact ? "is-compact" : "",
    dimmed ? "is-dim" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={shellClass}
      style={{ "--ov-alpha": prefs.opacity } as CSSProperties}
      onMouseEnter={() => setHot(true)}
      onMouseLeave={() => setHot(false)}
    >
      <div className="overlay-accent" />

      <div className="overlay-resize overlay-resize-e" onMouseDown={startResize("East")} />
      <div className="overlay-resize overlay-resize-w" onMouseDown={startResize("West")} />
      {!compact && (
        <>
          <div className="overlay-resize overlay-resize-n" onMouseDown={startResize("North")} />
          <div className="overlay-resize overlay-resize-s" onMouseDown={startResize("South")} />
          <div
            className="overlay-resize overlay-resize-se"
            onMouseDown={startResize("SouthEast")}
          />
        </>
      )}

      <header
        className="overlay-bar"
        data-tauri-drag-region
        onMouseDown={onDragHandleDown}
        onMouseUp={onDragHandleUp}
      >
        <div className="overlay-bar-main" data-tauri-drag-region>
          {resultLabel ? (
            <span className={`overlay-pill overlay-pill--${live.result}`}>
              {resultLabel}
            </span>
          ) : (
            <span className="overlay-vs" aria-hidden="true">
              vs
            </span>
          )}
          <span className="overlay-opp-line" data-tauri-drag-region>
            {opp}
            {oppGuessLabel ? (
              <span
                className="overlay-opp-arch"
                title={
                  matchupLine
                    ? `Inferred from cards seen · your record vs ${matchupLine.archetype}: ${matchupLine.detail}`
                    : "Inferred from cards seen"
                }
              >
                {" "}
                · {oppGuessLabel}
                {matchupLine ? (
                  <span className="overlay-opp-mu"> · {matchupLine.short}</span>
                ) : null}
              </span>
            ) : null}
          </span>
        </div>
        <div className="overlay-bar-stats" data-tauri-drag-region>
          {compact && prefs.barRecord && record.wr != null ? (
            <span
              className="overlay-stat overlay-stat--rec"
              title={`This season on this deck: ${record.wins}–${record.losses} · ${record.wr}%`}
            >
              {record.wins}–{record.losses}
              <em>{record.wr}%</em>
            </span>
          ) : null}
          {libTotal > 0 ? (
            <span
              className="overlay-stat overlay-stat--lib"
              title="Cards left in library"
            >
              {libTotal}
            </span>
          ) : null}
          {landStats ? (
            <span
              className="overlay-stat overlay-stat--land"
              title={`${landStats.rem} lands left in library${landPct != null ? ` · ${landPct}% of it` : ""}`}
            >
              {landStats.rem}L
              {landPct != null ? <em>{landPct}%</em> : null}
            </span>
          ) : null}
          {compact && playing && live.turn != null ? (
            <span
              className="overlay-mode-chip overlay-chip--turn"
              title={`Turn ${live.turn}${playLabel ? ` — on the ${playLabel.toLowerCase()}` : ""}`}
            >
              T{live.turn}
            </span>
          ) : null}
          {compact && live.bestOf > 1 ? (
            <span className="overlay-mode-chip" title="Best of three">
              Bo3
            </span>
          ) : null}
          {compact && prefs.barClock && playing ? (
            <MatchClock startedAt={live.startedAt} />
          ) : null}
        </div>
        <button
          type="button"
          className="overlay-icon-btn"
          title={compact ? "Expand deck tracker" : "Collapse to bar"}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            toggleCompact();
          }}
        >
          {compact ? "▾" : "▴"}
        </button>
      </header>

      {!compact && (
        <>
          <div className="overlay-sub" data-tauri-drag-region>
            <span className="overlay-deck-line" title={deck}>
              {deck}
            </span>
            <span className="overlay-sub-right" data-tauri-drag-region>
              {matchupLine ? (
                <span
                  className="overlay-mu-line"
                  title={`Personal matchup vs ${matchupLine.archetype} (cards actually seen in past games)`}
                >
                  vs {matchupLine.archetype}: {matchupLine.detail}
                </span>
              ) : cardsSeen > 0 ? (
                <span
                  className="overlay-seen-line"
                  title="Distinct opponent cards observed this match"
                >
                  {cardsSeen} seen
                </span>
              ) : null}
              {record.wr != null ? (
                <span
                  className="overlay-wr-line"
                  title={`${record.wr}% this season with this deck`}
                >
                  {record.wins}–{record.losses}
                </span>
              ) : null}
              {playing && live.turn != null ? (
                <span className="overlay-mode-chip overlay-chip--turn" title="Current turn">
                  T{live.turn}
                </span>
              ) : null}
              {playing && playLabel ? (
                <span
                  className="overlay-mode-chip"
                  title={playLabel === "Play" ? "You are on the play" : "You are on the draw"}
                >
                  {playLabel}
                </span>
              ) : null}
              {playing && (live.mulligans ?? 0) > 0 ? (
                <span
                  className="overlay-mode-chip overlay-chip--mull"
                  title={`Mulligans taken this game`}
                >
                  M{live.mulligans}
                </span>
              ) : null}
              <span className="overlay-mode-chip">
                {live.bestOf > 1 ? `Bo${live.bestOf}` : "Bo1"}
              </span>
              {playing ? <MatchClock startedAt={live.startedAt} /> : null}
            </span>
          </div>

          {!(ended && prefs.postMatch) && (
            <div className="overlay-tabs" role="tablist" aria-label="Overlay panel">
              <button
                type="button"
                role="tab"
                aria-selected={view === "deck"}
                className={`overlay-tab${view === "deck" ? " is-active" : ""}`}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => setView("deck")}
              >
                My deck
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === "opp"}
                className={`overlay-tab${view === "opp" ? " is-active" : ""}`}
                title="Cards your opponent has shown this match"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => setView("opp")}
              >
                Opponent{cardsSeen > 0 ? ` · ${cardsSeen}` : ""}
              </button>
            </div>
          )}

          {ended && prefs.postMatch ? (
            <PostMatchSummary
              live={live}
              matches={matches}
              record={record}
              oppGuess={oppGuessLabel}
            />
          ) : view === "opp" ? (
            <div className="overlay-decklist overlay-decklist--opp">
              {oppGuessLabel ? (
                <p className="overlay-opp-note">
                  Reads like <strong>{oppGuessLabel}</strong>
                  {matchupLine ? <em> · you {matchupLine.detail}</em> : null}
                </p>
              ) : null}
              {oppGroups.length > 0 ? (
                oppGroups.map((g) => <SeenSection key={g.id} group={g} />)
              ) : (
                <p className="overlay-hint">
                  Nothing revealed yet…
                  <span>Opponent cards land here as they get played or shown</span>
                </p>
              )}
            </div>
          ) : groups.length > 0 ? (
            <div className="overlay-decklist">
              {groups.map((g) => (
                <GroupSection
                  key={g.id}
                  group={g}
                  libraryTotal={libTotal}
                  maxPct={maxPct}
                />
              ))}
            </div>
          ) : (
            <p className="overlay-hint">
              Listening for the deck list…
              <span>
                Arena → Options → Account → Detailed Logs (Plugin Support)
              </span>
            </p>
          )}

          <div className="overlay-foot">
            {menuOpen && (
              <div className="overlay-menu" role="menu" aria-label="Overlay quick settings">
                <label className="overlay-menu-slider">
                  <span>Opacity</span>
                  <input
                    type="range"
                    min={55}
                    max={100}
                    step={1}
                    value={Math.round(prefs.opacity * 100)}
                    onChange={(e) =>
                      patchPrefs({ overlayOpacity: Number(e.target.value) / 100 })
                    }
                    aria-label="Overlay opacity"
                  />
                  <em>{Math.round(prefs.opacity * 100)}%</em>
                </label>
                <div className="overlay-menu-seg" role="radiogroup" aria-label="List density">
                  <span>Density</span>
                  {(["cozy", "compact", "minimal"] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      role="radio"
                      aria-checked={prefs.density === d}
                      className={`overlay-seg-btn${prefs.density === d ? " is-active" : ""}`}
                      onClick={() => patchPrefs({ overlayDensity: d })}
                    >
                      {d === "cozy" ? "Cozy" : d === "compact" ? "Compact" : "Minimal"}
                    </button>
                  ))}
                </div>
                <label className="overlay-menu-row">
                  <input
                    type="checkbox"
                    checked={prefs.idleDim}
                    onChange={(e) => patchPrefs({ overlayIdleDim: e.target.checked })}
                  />
                  <span>Dim while the mouse is away</span>
                </label>
                <label className="overlay-menu-row">
                  <input
                    type="checkbox"
                    checked={prefs.startExpanded}
                    onChange={(e) =>
                      patchPrefs({ overlayStartExpanded: e.target.checked })
                    }
                  />
                  <span>Start matches expanded</span>
                </label>
                <label className="overlay-menu-row">
                  <input
                    type="checkbox"
                    checked={prefs.barClock}
                    onChange={(e) => patchPrefs({ overlayBarClock: e.target.checked })}
                  />
                  <span>Clock on the minimized bar</span>
                </label>
                <label className="overlay-menu-row">
                  <input
                    type="checkbox"
                    checked={prefs.barRecord}
                    onChange={(e) => patchPrefs({ overlayBarRecord: e.target.checked })}
                  />
                  <span>Record on the minimized bar</span>
                </label>
                <label className="overlay-menu-row">
                  <input
                    type="checkbox"
                    checked={prefs.postMatch}
                    onChange={(e) => {
                      patchPrefs({ overlayPostMatch: e.target.checked });
                      void applyPostMatch(e.target.checked);
                    }}
                  />
                  <span>Post-match summary</span>
                </label>
                <button
                  type="button"
                  className="overlay-menu-danger"
                  title="Overlay ignores the mouse from now on — turn it back off in the main app (Settings → In-game overlay)"
                  onClick={() => {
                    patchPrefs({ overlayClickThrough: true });
                    setMenuOpen(false);
                    void applyClickThrough(true);
                  }}
                >
                  Enable click-through
                  <em>undo from the main app</em>
                </button>
              </div>
            )}
            <button
              type="button"
              className={`overlay-foot-pill${menuOpen ? " is-open" : ""}`}
              title="Overlay quick settings — no alt-tab needed"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
            >
              ⚙
            </button>
          </div>
        </>
      )}
    </div>
  );
}
