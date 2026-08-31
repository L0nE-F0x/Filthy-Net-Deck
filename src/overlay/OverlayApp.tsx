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
import {
  currentSeasonKey,
  deckKey,
  queueLabel,
  seasonKeyOf,
} from "../services/tracker";
import { bootThemeFromStorage } from "../services/theme";
import {
  peekArenaMeta,
  peekSeenCard,
  resolveArenaMetaBatch,
  type ArenaCardMeta,
} from "../services/arenaMeta";
import { isTauri } from "../services/appUpdater";
import {
  drawPct,
  formatClock,
  formatConfidencePct,
  groupLibrary,
  groupSeenCards,
  landDrawHeadline,
  matchupHudLine,
  opponentCardsSeenCount,
  parseManaCost,
  pipText,
  pipTone,
  playDrawLabel,
  sessionWl,
  showSideboardTab,
  type OverlayGroup,
  type OverlayRow,
  type OverlayWindowMode,
} from "./overlayModel";
import { sessionWindow } from "../services/recapStats";
import { inferOpponentArchetype } from "../services/opponentArchetype";
import { deckMatchupMatrix } from "../services/gameAnalytics";
import { inferenceCandidates } from "../services/deckHelpers";
import { isUncoveredFormat, localFormatOf } from "../services/arenaFormat";
import type { MetaBundle, PlayMode } from "../types/meta";
import { queueRankedKind, rankedChipLabel } from "../services/ranks";
import { PostMatchSummary } from "./PostMatchSummary";
import {
  PREFS_KEY,
  readOverlayPrefs,
  writeOverlayPrefs,
  type OverlayPrefs,
} from "./overlayPrefs";
import { overlayUserClose, setOverlayWindowMode } from "../services/overlay";
import { applyLocalePref, readLocalePref, t, useLocale } from "../i18n";


const SNAP_PX = 24;
/** Collapsed = accent line + title bar only. Keep in sync with the CSS bar height. */
const COLLAPSED_H = 34;
/** Expanded window never goes below this when restoring. */
const MIN_EXPANDED_H = 120;
/** Grow the panel to at least this tall while the post-match summary is up. */
const SUMMARY_MIN_H = 252;
/** First-run overlay vs companion chooser. */
const CHOOSER_MIN_H = 220;

/** Disk shape for overlay_save_geometry / overlay_get_geometry (Rust camelCase). */
interface OverlayGeometry {
  x: number;
  y: number;
  width: number;
  /** Expanded-panel height — never the collapsed bar. */
  height: number;
  /** Last mode the user left the panel in. */
  expanded: boolean;
}


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
    // Guard the hash compare: `undefined === undefined` matched every deckless
    // match into whatever deck was on screen.
    return deckKey(m) === key || (!!live.deckHash && m.deckHash === live.deckHash);
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

/** Overlay HUD vs companion chrome — Rust owns always-on-top / taskbar / hide. */
async function applyWindowMode(mode: OverlayWindowMode) {
  await setOverlayWindowMode(mode === "companion");
}

/**
 * Write position + size + expanded/collapsed to disk.
 * `expandedHeight` is always the full-panel height (never COLLAPSED_H).
 * `expanded` is the mode the user left the panel in — restored across matches,
 * app restarts, and PC reboots (this was the missing piece: size alone was
 * saved, then every new match re-applied the Settings "start expanded" pref).
 */
async function persistGeometry(opts: {
  expandedHeight: number;
  expanded: boolean;
}): Promise<void> {
  if (!isTauri()) return;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    const pos = await win.outerPosition();
    const size = await win.outerSize();
    const factor = await win.scaleFactor();
    const height = Math.max(opts.expandedHeight, MIN_EXPANDED_H);
    await invoke("overlay_save_geometry", {
      geometry: {
        x: pos.x / factor,
        y: pos.y / factor,
        width: size.width / factor,
        height,
        expanded: opts.expanded,
      } satisfies OverlayGeometry,
    });
  } catch {
    /* ignore */
  }
}

async function loadGeometry(): Promise<OverlayGeometry | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<OverlayGeometry | null>("overlay_get_geometry");
  } catch {
    return null;
  }
}

async function snapToEdges(opts: {
  expandedHeight: number;
  expanded: boolean;
}) {
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
    await persistGeometry(opts);
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
        <span className="overlay-group-label">
          {t(
            group.id === "land"
              ? "common.lands"
              : group.id === "creature"
                ? "common.creatures"
                : "common.spells",
          )}
        </span>
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

/** Opponent-seen row: qty · art · name · pips. */
const SeenRow = memo(function SeenRow({ row }: { row: OverlayRow }) {
  const label = row.meta?.name ?? `Card ${row.card.grpId}`;
  const art = row.meta?.artUrl;
  const qty = Math.max(1, row.card.remaining);
  return (
    <li className={`overlay-card-row is-seen${row.meta?.isLand ? " is-land" : ""}`}>
      <span className="overlay-card-qty" title={`${qty} shown`}>
        {qty}
      </span>
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
      <span className="overlay-card-name" title={qty > 1 ? `${qty}× ${label}` : label}>
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
        <span className="overlay-group-label">
          {t(
            group.id === "land"
              ? "common.lands"
              : group.id === "creature"
                ? "common.creatures"
                : "common.spells",
          )}
        </span>
        <span className="overlay-group-count">{group.remaining}</span>
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
function OverlayModeChooser({
  onPick,
}: {
  onPick: (mode: OverlayWindowMode) => void;
}) {
  const { t } = useLocale();
  return (
    <div className="overlay-chooser" role="dialog" aria-label={t("overlay.chooserAria")}>
      <p className="overlay-chooser-title">{t("overlay.chooserTitle")}</p>
      <button
        type="button"
        className="overlay-chooser-opt"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => onPick("overlay")}
      >
        <strong>{t("overlay.hudTitle")}</strong>
        <em>{t("overlay.hudBlurb")}</em>
      </button>
      <button
        type="button"
        className="overlay-chooser-opt"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => onPick("companion")}
      >
        <strong>{t("overlay.windowTitle")}</strong>
        <em>{t("overlay.windowBlurb")}</em>
      </button>
    </div>
  );
}

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
  const { t } = useLocale();
  const [live, setLive] = useState<LiveMatch | null>(null);
  const [matches, setMatches] = useState<TrackedMatch[]>([]);
  /**
   * Compact starts from the Settings fallback; mount immediately re-syncs from
   * disk geometry (last user mode) so a restart does not flash the wrong size.
   */
  const [compact, setCompact] = useState(() => !readOverlayPrefs().startExpanded);
  const [prefs, setPrefs] = useState<OverlayPrefs>(() => readOverlayPrefs());
  /**
   * Last non-idle live frame. Companion mode keeps rendering this after the
   * tracker clears the match so the window does not go blank.
   */
  const [held, setHeld] = useState<LiveMatch | null>(null);
  /** Quick-settings pill menu (footer of the expanded overlay). */
  const [menuOpen, setMenuOpen] = useState(false);
  /** Expanded list panel: library, sideboard (Bo3), or opponent's seen cards. */
  const [view, setView] = useState<"deck" | "side" | "opp">("deck");
  /** Idle-dim: true while the cursor is over the panel. */
  const [hot, setHot] = useState(false);
  const dragArmed = useRef(false);
  const liveRaf = useRef(0);
  const pendingLive = useRef<LiveMatch | null | undefined>(undefined);
  /** Expanded height to restore when leaving the collapsed bar. */
  const expandedH = useRef(168);
  /** Last restored width from disk (kept so match-start can re-apply it). */
  const expandedW = useRef(228);
  /** True while a programmatic collapse/expand resize is in flight. */
  const programmaticResize = useRef(false);
  const compactRef = useRef(compact);
  /**
   * Settings "start expanded" — only used when no geometry has been saved yet.
   * After the user resizes/toggles once, disk geometry.expanded is the source
   * of truth across matches and restarts.
   */
  const startExpandedRef = useRef(readOverlayPrefs().startExpanded);
  const windowModeRef = useRef(readOverlayPrefs().windowMode);
  /** matchId geometry was last re-applied for (once per match). */
  const appliedMatchRef = useRef<string | null>(null);
  /** matchId the post-match summary was last auto-shown for (once per match). */
  const appliedSummaryRef = useRef<string | null>(null);
  /** Panel height before the summary grew it — restored on the next match. */
  const preSummaryH = useRef<number | null>(null);

  /** Snapshot used by every persist path so saves stay consistent. */
  const geometrySnapshot = useCallback(
    () => ({
      expandedHeight: expandedH.current,
      expanded: !compactRef.current,
    }),
    [],
  );

  useEffect(() => {
    compactRef.current = compact;
  }, [compact]);

  useEffect(() => {
    bootThemeFromStorage();
    const initial = readOverlayPrefs();
    void applyWindowMode(initial.windowMode);
    if (initial.windowMode !== "companion") {
      void applyClickThrough(initial.clickThrough);
    }
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
      applyLocalePref(readLocalePref());
      startExpandedRef.current = p.startExpanded;
      if (p.windowMode !== windowModeRef.current) {
        windowModeRef.current = p.windowMode;
        void applyWindowMode(p.windowMode);
      }
      if (p.windowMode !== "companion") {
        void applyClickThrough(p.clickThrough);
      }
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
      const params = new URLSearchParams(window.location.search);
      if (!isTauri() && params.has("demo")) {
        const { demoLiveMatch, demoMatches } = await import("./demoLive");
        if (!cancelled) {
          setLive(demoLiveMatch({ ended: params.get("phase") === "ended" }));
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
          applyLocalePref(readLocalePref());
          startExpandedRef.current = p.startExpanded;
          if (p.windowMode !== windowModeRef.current) {
            windowModeRef.current = p.windowMode;
            void applyWindowMode(p.windowMode);
          }
          if (p.windowMode !== "companion") {
            void applyClickThrough(p.clickThrough);
          }
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

          // Restore last size + mode from disk (survives match / app / PC restart).
          try {
            const geo = await loadGeometry();
            const size = await win.outerSize();
            const factor = await win.scaleFactor();
            const curW = size.width / factor;
            const curH = size.height / factor;
            if (geo) {
              expandedH.current = Math.max(geo.height, MIN_EXPANDED_H);
              expandedW.current = geo.width;
              const wantCompact = !geo.expanded;
              compactRef.current = wantCompact;
              setCompact(wantCompact);
              programmaticResize.current = true;
              try {
                await win.setSize(
                  new LogicalSize(
                    geo.width,
                    wantCompact ? COLLAPSED_H : expandedH.current,
                  ),
                );
              } finally {
                window.setTimeout(() => {
                  programmaticResize.current = false;
                }, 400);
              }
            } else {
              expandedH.current = Math.max(curH, MIN_EXPANDED_H);
              expandedW.current = curW;
              // First run: honor Settings "start expanded".
              const wantCompact = !startExpandedRef.current;
              compactRef.current = wantCompact;
              setCompact(wantCompact);
              if (wantCompact && curH > COLLAPSED_H + 4) {
                programmaticResize.current = true;
                try {
                  await win.setSize(new LogicalSize(curW, COLLAPSED_H));
                } finally {
                  window.setTimeout(() => {
                    programmaticResize.current = false;
                  }, 400);
                }
              }
            }
          } catch {
            /* ignore */
          }

          unlistenMoved = await win.onMoved(() => {
            if (!dragArmed.current) return;
            window.clearTimeout(snapTimer);
            snapTimer = window.setTimeout(() => {
              void snapToEdges({
                expandedHeight: expandedH.current,
                expanded: !compactRef.current,
              });
            }, 140);
          });
          unlistenResized = await win.onResized(() => {
            // Programmatic collapse/expand resizes are not user geometry.
            if (programmaticResize.current) return;
            window.clearTimeout(snapTimer);
            snapTimer = window.setTimeout(() => {
              void (async () => {
                try {
                  const { getCurrentWindow } = await import(
                    "@tauri-apps/api/window"
                  );
                  const w = getCurrentWindow();
                  const factor = await w.scaleFactor();
                  const size = await w.outerSize();
                  const logicalH = size.height / factor;
                  const logicalW = size.width / factor;
                  expandedW.current = logicalW;
                  // While expanded, the drag is changing the remembered height.
                  // While collapsed, only width changes (height is the bar).
                  if (!compactRef.current && logicalH >= MIN_EXPANDED_H) {
                    expandedH.current = logicalH;
                  }
                  await persistGeometry({
                    expandedHeight: expandedH.current,
                    expanded: !compactRef.current,
                  });
                } catch {
                  /* ignore */
                }
              })();
            }, 250);
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

  useEffect(() => {
    if (live && (live.phase === "playing" || live.phase === "ended")) {
      setHeld(live);
    }
  }, [live]);

  const companion = prefs.windowMode === "companion";
  const hud =
    live && (live.phase === "playing" || live.phase === "ended")
      ? live
      : companion && held
        ? held
        : live;
  const showChooser = !prefs.windowModeChosen && !!hud && hud.phase === "playing";

  const playing = hud?.phase === "playing";

  const record = useMemo(() => seasonRecord(matches, hud), [matches, hud]);
  const session = useMemo(() => {
    const { fromMs } = sessionWindow(matches);
    return sessionWl(matches, fromMs);
  }, [matches]);
  // One meta map for library, sideboard, and the opponent's seen cards.
  const allIds = useMemo(() => {
    const ids = (hud?.library ?? []).map((c) => c.grpId);
    for (const c of hud?.sideboard ?? []) ids.push(c.grpId);
    for (const id of hud?.opponentSeen ?? []) ids.push(id);
    return ids;
  }, [hud?.library, hud?.sideboard, hud?.opponentSeen]);
  const metaMap = useArenaMetaMap(allIds);

  const groups = useMemo(
    () => groupLibrary(hud?.library ?? [], (id) => metaMap.get(id)),
    [hud?.library, metaMap],
  );

  const sideGroups = useMemo(
    () => groupLibrary(hud?.sideboard ?? [], (id) => metaMap.get(id)),
    [hud?.sideboard, metaMap],
  );

  const oppGroups = useMemo(
    () => groupSeenCards(hud?.opponentSeen, (id) => metaMap.get(id)),
    [hud?.opponentSeen, metaMap],
  );

  const libTotal = hud?.libraryTotal ?? 0;
  const sideTotal = hud?.sideboardTotal ?? 0;
  const sideboardTab = hud ? showSideboardTab(hud) : false;

  const maxPct = useMemo(() => {
    let m = 0;
    for (const c of hud?.library ?? []) {
      const p = drawPct(c.remaining, libTotal) ?? 0;
      if (p > m) m = p;
    }
    return m;
  }, [hud?.library, libTotal]);

  const landStats = useMemo(() => {
    const library = hud?.library ?? [];
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
  }, [hud?.library, metaMap]);

  const onDragHandleDown = useCallback(() => {
    dragArmed.current = true;
  }, []);
  const onDragHandleUp = useCallback(() => {
    window.setTimeout(() => {
      dragArmed.current = false;
      void snapToEdges(geometrySnapshot());
    }, 80);
  }, [geometrySnapshot]);

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
            // Resize drag ends asynchronously — sample size after it settles.
            // onResized also persists; this is a belt-and-braces flush.
            window.setTimeout(() => {
              void (async () => {
                try {
                  const { getCurrentWindow } = await import(
                    "@tauri-apps/api/window"
                  );
                  const win = getCurrentWindow();
                  const factor = await win.scaleFactor();
                  const size = await win.outerSize();
                  const logicalH = size.height / factor;
                  const logicalW = size.width / factor;
                  expandedW.current = logicalW;
                  if (!compactRef.current && logicalH >= MIN_EXPANDED_H) {
                    expandedH.current = logicalH;
                  }
                  await persistGeometry({
                    expandedHeight: expandedH.current,
                    expanded: !compactRef.current,
                  });
                } catch {
                  /* ignore */
                }
              })();
            }, 400);
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
    // Keep Settings "start expanded" in sync with the last mode the user chose
    // so first-run fallback matches reality if geometry is ever wiped.
    writeOverlayPrefs({ overlayStartExpanded: !next });
    startExpandedRef.current = !next;
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
        expandedW.current = w;
        programmaticResize.current = true;
        try {
          if (next) {
            // Collapsing — remember the real expanded height (not summary grow).
            if (preGrownH != null) {
              expandedH.current = Math.max(preGrownH, MIN_EXPANDED_H);
            } else if (curH >= MIN_EXPANDED_H) {
              expandedH.current = curH;
            }
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
        // Persist mode + expanded height immediately so the next match / reboot
        // opens exactly how the user left it.
        await persistGeometry({
          expandedHeight: expandedH.current,
          expanded: !next,
        });
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

  // Once per match: re-apply the *last saved* size + expanded/collapsed mode
  // from disk. This undoes post-match summary grow and any transient drift,
  // without forcing the Settings "start expanded" pref over a manual toggle.
  const liveMatchId = live?.matchId;
  const livePhase = live?.phase;
  useEffect(() => {
    if (
      livePhase === "playing" &&
      liveMatchId &&
      appliedMatchRef.current !== liveMatchId
    ) {
      appliedMatchRef.current = liveMatchId;
      setView("deck");
      if (!isTauri()) {
        // Browser demo: Settings fallback only.
        setCompactMode(!startExpandedRef.current);
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
          const geo = await loadGeometry();
          const w = geo?.width ?? expandedW.current ?? size.width / factor;
          const h = Math.max(
            geo?.height ?? expandedH.current,
            MIN_EXPANDED_H,
          );
          // Prefer disk mode; fall back to in-memory compact, then Settings.
          const wantExpanded =
            geo != null
              ? geo.expanded
              : startExpandedRef.current;
          expandedH.current = h;
          expandedW.current = w;
          programmaticResize.current = true;
          try {
            if (wantExpanded) {
              compactRef.current = false;
              setCompact(false);
              await win.setSize(new LogicalSize(w, h));
              await ensureOnScreen();
            } else {
              compactRef.current = true;
              setCompact(true);
              await win.setSize(new LogicalSize(w, COLLAPSED_H));
            }
          } finally {
            window.setTimeout(() => {
              programmaticResize.current = false;
            }, 400);
          }
        } catch {
          /* leave current size alone */
        }
      })();
    }
  }, [liveMatchId, livePhase, setCompactMode]);

  // Post-match summary: briefly expand tall enough for the card. Does NOT
  // write geometry — the user's saved size/mode is restored on the next match.
  const summaryOn = livePhase === "ended" && prefs.postMatch;
  useEffect(() => {
    if (summaryOn && liveMatchId) {
      if (appliedSummaryRef.current === liveMatchId) return;
      appliedSummaryRef.current = liveMatchId;
      if (!isTauri()) {
        // Demo only — don't persist compact mode flip.
        if (compactRef.current) {
          compactRef.current = false;
          setCompact(false);
        }
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
          // Remember true expanded height so we never save the summary grow.
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
            // Hold the flag long enough that onResized cannot persist the grow.
            window.setTimeout(() => {
              programmaticResize.current = false;
            }, 800);
          }
        } catch {
          /* ignore */
        }
      })();
    } else if (livePhase === "playing" && preSummaryH.current != null) {
      // Match-start effect already re-applies disk geometry; clear the stash.
      preSummaryH.current = null;
      if (compactRef.current || !isTauri()) return;
      // If match-start did not run (same match id edge case), shrink off grow.
      const target = Math.max(expandedH.current, MIN_EXPANDED_H);
      void (async () => {
        try {
          const { getCurrentWindow, LogicalSize } = await import(
            "@tauri-apps/api/window"
          );
          const win = getCurrentWindow();
          const factor = await win.scaleFactor();
          const size = await win.outerSize();
          if (size.height / factor <= target + 2) return;
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
    // Computed before the early return: the format is knowable from the queue
    // alone, and the note explaining a missing read has to show from the first
    // second of the match, not only once the opponent has revealed something.
    const uncovered = isUncoveredFormat(hud?.eventId);
    if (!hud?.opponentSeen?.length) {
      return {
        guess: null as string | null,
        confidence: null as number | null,
        matchup: null as ReturnType<typeof matchupHudLine>,
        seen: opponentCardsSeenCount(hud?.opponentSeen),
        uncovered,
      };
    }
    const bundle = loadMetaCache();
    const resolveName = (id: number) => peekSeenCard(id);
    const inferOpts = { minHits: 2, minConfidence: 0.35 };

    let guess: string | null = null;
    let candidates: ReturnType<typeof inferenceCandidates> = [];
    // A queue the app ships no deck field for gets no guess at all.
    //
    // This used to fall through to the featured format, so a Historic or Brawl
    // game had its opponent inferred against the *Standard* board — and a
    // Historic Izzet list clears the 0.35 confidence floor against Standard's
    // Izzet deck easily. The overlay would then name a deck the opponent
    // demonstrably was not on, live, mid-match. No line beats a wrong line.
    let confidence: number | null = null;
    if (bundle && !uncovered) {
      // Pioneer/Explorer queues infer against the Pioneer field, not blindly
      // against the featured format (Standard). An unnamed queue still falls
      // back to featured — unknown is not the same as known-uncovered.
      const eventFmt = localFormatOf(hud.eventId, null);
      const fmt =
        bundle.formats.find((f) => f.id === eventFmt) ??
        bundle.formats.find((f) => f.featured) ??
        bundle.formats[0];
      if (fmt) {
        const mode: PlayMode = /Traditional/i.test(hud.eventId) ? "bo3" : "bo1";
        // Both modes + full format field so Lessons twins don't collapse.
        candidates = inferenceCandidates(bundle.decks, { format: fmt, mode });
        const g = inferOpponentArchetype(
          hud.opponentSeen,
          resolveName,
          candidates,
          // Arena's own basic-land types for this match only — the historical
          // matrix below reads each past match's own basics.
          { ...inferOpts, basicLandTypes: hud.opponentBasics },
        );
        guess = g ? g.archetype : null;
        confidence = g ? g.confidence : null;
      }
    }

    let matchup = null as ReturnType<typeof matchupHudLine>;
    if (guess && candidates.length) {
      const key = hud.deckId ?? hud.deckName ?? hud.deckHash ?? null;
      const sameDeck = matches.filter((m) => {
        if (m.result !== "win" && m.result !== "loss") return false;
        if (!key) return false;
        return deckKey(m) === key || (!!hud.deckHash && m.deckHash === hud.deckHash);
      });
      const rows = deckMatchupMatrix(sameDeck, resolveName, candidates, inferOpts);
      matchup = matchupHudLine(rows, guess, 2);
    }

    return {
      guess,
      confidence,
      matchup,
      seen: opponentCardsSeenCount(hud.opponentSeen),
      uncovered,
    };
  }, [hud, matches, metaMap]);

  const oppGuessLabel = oppHud.guess;
  const oppConfidence = oppHud.confidence;
  const matchupLine = oppHud.matchup;
  const cardsSeen = oppHud.seen;
  /** Queue FND ships no deck field for — the archetype read is off on purpose. */
  const uncoveredFormat = oppHud.uncovered;
  const confLabel =
    oppConfidence != null ? formatConfidencePct(oppConfidence) : null;
  const landHeadline = landStats
    ? landDrawHeadline(landStats.rem, libTotal)
    : null;

  const pickWindowMode = useCallback(
    (mode: OverlayWindowMode) => {
      writeOverlayPrefs({
        overlayWindowMode: mode,
        overlayWindowModeChosen: true,
      });
      windowModeRef.current = mode;
      const p = readOverlayPrefs();
      setPrefs(p);
      void applyWindowMode(mode);
    },
    [],
  );

  const closeCompanion = useCallback(() => {
    void overlayUserClose();
  }, []);

  // Grow the window while the first-run chooser is up, same as post-match.
  useEffect(() => {
    if (!showChooser || !isTauri()) return;
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
        if (curH >= CHOOSER_MIN_H) return;
        if (compactRef.current) {
          compactRef.current = false;
          setCompact(false);
        }
        programmaticResize.current = true;
        try {
          await win.setSize(
            new LogicalSize(w, Math.max(curH, CHOOSER_MIN_H)),
          );
        } finally {
          window.setTimeout(() => {
            programmaticResize.current = false;
          }, 400);
        }
      } catch {
        /* ignore */
      }
    })();
  }, [showChooser]);

  if (!hud || hud.phase === "idle") {
    return <div className="overlay-empty" />;
  }

  const ended = hud.phase === "ended";
  const opp = hud.opponentName?.trim() || "Opponent";
  const deck = hud.deckName?.trim() || "…";
  const resultLabel =
    ended && hud.result
      ? hud.result === "win"
        ? t("common.victory")
        : hud.result === "loss"
          ? t("common.defeat")
          : hud.result === "draw"
            ? t("common.draw")
            : t("common.ended")
      : null;

  const playLabel = playDrawLabel(hud.onPlay);
  const rankedLabel = rankedChipLabel(hud.eventId);
  const rankedKind = queueRankedKind(hud.eventId);

  // Quiet down while the mouse is elsewhere. Never while ended (result should
  // pop) and never with click-through (no hover events would ever wake it).
  // Companion is a normal window — never translucent-dim.
  const dimmed =
    !companion &&
    prefs.idleDim &&
    !hot &&
    !prefs.clickThrough &&
    !menuOpen &&
    !ended &&
    !showChooser;

  const shellClass = [
    "overlay-shell",
    `density-${prefs.density}`,
    ended ? "is-ended" : "",
    ended && hud.result ? `is-${hud.result}` : "",
    compact && !showChooser ? "is-compact" : "",
    dimmed ? "is-dim" : "",
    companion ? "is-companion" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={shellClass}
      style={{ "--ov-alpha": companion ? 1 : prefs.opacity } as CSSProperties}
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
            <span className={`overlay-pill overlay-pill--${hud.result}`}>
              {resultLabel}
            </span>
          ) : (
            <span className="overlay-vs" aria-hidden="true">
              {t("common.vs")}
            </span>
          )}
          <span className="overlay-opp-cluster" data-tauri-drag-region>
            <span className="overlay-opp-line" data-tauri-drag-region>
              {opp}
            </span>
            {oppGuessLabel ? (
              <span
                className="overlay-opp-arch"
                title={
                  confLabel && matchupLine
                    ? t("overlay.inferredBoth", {
                        pct: confLabel,
                        arch: matchupLine.archetype,
                        detail: matchupLine.detail,
                      })
                    : confLabel
                      ? t("overlay.inferredConf", { pct: confLabel })
                      : matchupLine
                        ? t("overlay.inferredMu", {
                            arch: matchupLine.archetype,
                            detail: matchupLine.detail,
                          })
                        : t("overlay.inferred")
                }
              >
                <span className="overlay-opp-arch-sep"> · </span>
                {oppGuessLabel}
                {confLabel ? (
                  <span className="overlay-opp-conf"> {confLabel}</span>
                ) : null}
                {!compact && matchupLine ? (
                  <span className="overlay-opp-mu"> · {matchupLine.short}</span>
                ) : null}
              </span>
            ) : null}
          </span>
        </div>
        <div className="overlay-bar-stats" data-tauri-drag-region>
          {compact && prefs.barRecord && session.wr != null ? (
            <span
              className="overlay-stat overlay-stat--rec"
              title={
                record.wr != null
                  ? t("overlay.sessionTitleSeason", {
                      wins: session.wins,
                      losses: session.losses,
                      sw: record.wins,
                      sl: record.losses,
                      wr: record.wr,
                    })
                  : t("overlay.sessionTitle", {
                      wins: session.wins,
                      losses: session.losses,
                    })
              }
            >
              {session.wins}–{session.losses}
            </span>
          ) : null}
          {compact && landHeadline ? (
            <span
              className="overlay-stat overlay-stat--land"
              title={
                landStats && landStats.rem === 1
                  ? t("overlay.landTitleOne", { pct: landHeadline.pct })
                  : t("overlay.landTitle", {
                      pct: landHeadline.pct,
                      n: landStats?.rem ?? 0,
                    })
              }
            >
              <span className="overlay-land-full">
                {t("overlay.landLabel", { pct: landHeadline.pct })}
              </span>
              <span className="overlay-land-short">{landHeadline.pct}%</span>
            </span>
          ) : null}
          {compact && playing && hud.turn != null ? (
            <span
              className="overlay-mode-chip overlay-chip--turn"
              title={
                playLabel === "Play"
                  ? t("overlay.turnPlay", { n: hud.turn })
                  : playLabel === "Draw"
                    ? t("overlay.turnDraw", { n: hud.turn })
                    : t("overlay.turn", { n: hud.turn })
              }
            >
              T{hud.turn}
            </span>
          ) : null}
          {compact && prefs.barClock && playing ? (
            <MatchClock startedAt={hud.startedAt} />
          ) : null}
        </div>
        <button
          type="button"
          className="overlay-icon-btn"
          title={compact ? t("overlay.expand") : t("overlay.collapse")}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            toggleCompact();
          }}
        >
          {compact ? "▾" : "▴"}
        </button>
        {companion ? (
          <button
            type="button"
            className="overlay-icon-btn overlay-icon-btn--close"
            title={t("overlay.closeWindow")}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              closeCompanion();
            }}
          >
            ×
          </button>
        ) : null}
      </header>

      {showChooser ? <OverlayModeChooser onPick={pickWindowMode} /> : null}

      {!compact && !showChooser && (
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
              {playing && hud.turn != null ? (
                <span className="overlay-mode-chip overlay-chip--turn" title="Current turn">
                  T{hud.turn}
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
              {playing && (hud.mulligans ?? 0) > 0 ? (
                <span
                  className="overlay-mode-chip overlay-chip--mull"
                  title={`Mulligans taken this game`}
                >
                  M{hud.mulligans}
                </span>
              ) : null}
              <span className="overlay-mode-chip">
                {hud.bestOf > 1 ? `Bo${hud.bestOf}` : "Bo1"}
              </span>
              {rankedLabel ? (
                <span
                  className={`overlay-mode-chip overlay-chip--queue is-${rankedKind}`}
                  title={queueLabel(hud.eventId)}
                >
                  {rankedLabel}
                </span>
              ) : null}
              {playing ? <MatchClock startedAt={hud.startedAt} /> : null}
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
                {t("overlay.myDeck")}
              </button>
              {sideboardTab ? (
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === "side"}
                  className={`overlay-tab${view === "side" ? " is-active" : ""}`}
                  title={t("overlay.sideTab")}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => setView("side")}
                >
                  {t("overlay.sideboard")}{sideTotal > 0 ? ` · ${sideTotal}` : ""}
                </button>
              ) : null}
              <button
                type="button"
                role="tab"
                aria-selected={view === "opp"}
                className={`overlay-tab${view === "opp" ? " is-active" : ""}`}
                title={t("overlay.seenCards")}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => setView("opp")}
              >
                {t("overlay.opponent")}{cardsSeen > 0 ? ` · ${cardsSeen}` : ""}
              </button>
            </div>
          )}

          {ended && prefs.postMatch ? (
            <PostMatchSummary
              live={hud}
              matches={matches}
              record={record}
              oppGuess={oppGuessLabel}
            />
          ) : view === "opp" ? (
            <div className="overlay-decklist overlay-decklist--opp">
              {/*
                Three states, not two. A missing archetype read means either
                "not enough cards yet" (keep watching) or "this queue has no
                deck field to read against" (it is never coming) — and leaving
                the second one silent reads as the overlay being broken.
              */}
              {uncoveredFormat ? (
                <p
                  className="overlay-opp-note overlay-opp-note--off"
                  title={`${queueLabel(hud.eventId)} — Filthy Net Deck tracks the Standard and Pioneer metagames, so there is no deck list to match this opponent against. Guessing from the Standard field would name a deck they are not playing. Revealed cards below are tracked as normal.`}
                >
                  {t("overlay.untracked")}
                </p>
              ) : oppGuessLabel ? (
                <p className="overlay-opp-note">
                  {t("overlay.readsLike")} <strong>{oppGuessLabel}</strong>
                  {matchupLine ? <em> · you {matchupLine.detail}</em> : null}
                </p>
              ) : null}
              {oppGroups.length > 0 ? (
                oppGroups.map((g) => <SeenSection key={g.id} group={g} />)
              ) : (
                <p className="overlay-hint">
                  {t("overlay.nothingRevealed")}
                  <span>{t("overlay.nothingRevealedHint")}</span>
                </p>
              )}
            </div>
          ) : view === "side" && sideboardTab ? (
            <div className="overlay-decklist overlay-decklist--side">
              {sideGroups.length > 0 ? (
                sideGroups.map((g) => (
                  <GroupSection
                    key={g.id}
                    group={g}
                    // No next-draw odds for the sideboard — hide the % column.
                    libraryTotal={0}
                    maxPct={0}
                  />
                ))
              ) : (
                <p className="overlay-hint">
                  {t("overlay.waitingSide")}
                  <span>{t("overlay.waitingSideHint")}</span>
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
              {t("overlay.listeningDeck")}
              <span>{t("overlay.listeningDeckHint")}</span>
            </p>
          )}

          <div className="overlay-foot">
            {menuOpen && (
              <div className="overlay-menu" role="menu" aria-label={t("overlay.menuAria")}>
                <label className="overlay-menu-slider">
                  <span>{t("overlay.opacity")}</span>
                  <input
                    type="range"
                    min={55}
                    max={100}
                    step={1}
                    value={Math.round(prefs.opacity * 100)}
                    onChange={(e) =>
                      patchPrefs({ overlayOpacity: Number(e.target.value) / 100 })
                    }
                    aria-label={t("overlay.opacityAria")}
                  />
                  <em>{Math.round(prefs.opacity * 100)}%</em>
                </label>
                <div className="overlay-menu-seg" role="radiogroup" aria-label={t("overlay.windowModeAria")}>
                  <span>{t("overlay.window")}</span>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!companion}
                    className={`overlay-seg-btn${!companion ? " is-active" : ""}`}
                    onClick={() => pickWindowMode("overlay")}
                  >
                    {t("overlay.overlay")}
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={companion}
                    className={`overlay-seg-btn${companion ? " is-active" : ""}`}
                    onClick={() => pickWindowMode("companion")}
                  >
                    {t("overlay.window")}
                  </button>
                </div>
                <div className="overlay-menu-seg" role="radiogroup" aria-label={t("overlay.densityAria")}>
                  <span>{t("overlay.density")}</span>
                  {(["cozy", "compact", "minimal"] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      role="radio"
                      aria-checked={prefs.density === d}
                      className={`overlay-seg-btn${prefs.density === d ? " is-active" : ""}`}
                      onClick={() => patchPrefs({ overlayDensity: d })}
                    >
                      {d === "cozy"
                        ? t("overlay.cozy")
                        : d === "compact"
                          ? t("overlay.compact")
                          : t("overlay.minimal")}
                    </button>
                  ))}
                </div>
                <label className="overlay-menu-row">
                  <input
                    type="checkbox"
                    checked={prefs.idleDim}
                    onChange={(e) => patchPrefs({ overlayIdleDim: e.target.checked })}
                  />
                  <span>{t("overlay.idleDim")}</span>
                </label>
                <label className="overlay-menu-row">
                  <input
                    type="checkbox"
                    checked={!compact}
                    onChange={(e) => setCompactMode(!e.target.checked)}
                  />
                  <span>{t("overlay.expandedSave")}</span>
                </label>
                <label className="overlay-menu-row">
                  <input
                    type="checkbox"
                    checked={prefs.barClock}
                    onChange={(e) => patchPrefs({ overlayBarClock: e.target.checked })}
                  />
                  <span>{t("overlay.barClock")}</span>
                </label>
                <label className="overlay-menu-row">
                  <input
                    type="checkbox"
                    checked={prefs.barRecord}
                    onChange={(e) => patchPrefs({ overlayBarRecord: e.target.checked })}
                  />
                  <span>{t("overlay.barRecord")}</span>
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
                  <span>{t("overlay.postMatch")}</span>
                </label>
                {companion ? null : (
                <button
                  type="button"
                  className="overlay-menu-danger"
                  title={t("overlay.clickThroughTitle")}
                  onClick={() => {
                    patchPrefs({ overlayClickThrough: true });
                    setMenuOpen(false);
                    void applyClickThrough(true);
                  }}
                >
                  {t("overlay.clickThrough")}
                  <em>{t("overlay.clickThroughUndo")}</em>
                </button>
                )}
              </div>
            )}
            <button
              type="button"
              className={`overlay-foot-pill${menuOpen ? " is-open" : ""}`}
              title={t("overlay.gearTitle")}
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
