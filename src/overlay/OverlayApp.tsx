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
  normalizeOpacity,
  parseManaCost,
  pipText,
  pipTone,
  type OverlayGroup,
} from "./overlayModel";
import { inferOpponentArchetype } from "../services/opponentArchetype";
import { decksForMode } from "../services/deckHelpers";
import type { MetaBundle } from "../types/meta";


const SNAP_PX = 24;
/** Collapsed = accent line + title bar only. Keep in sync with the CSS bar height. */
const COLLAPSED_H = 34;
/** Expanded window never goes below this when restoring. */
const MIN_EXPANDED_H = 120;
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

/** Overlay display prefs written by Settings in the main window. */
function readOverlayPrefs(): {
  opacity: number;
  startExpanded: boolean;
  clickThrough: boolean;
} {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        overlayOpacity?: number;
        overlayStartExpanded?: boolean;
        overlayClickThrough?: boolean;
      };
      return {
        opacity: normalizeOpacity(parsed.overlayOpacity),
        startExpanded: parsed.overlayStartExpanded === true,
        clickThrough: parsed.overlayClickThrough === true,
      };
    }
  } catch {
    /* ignore */
  }
  return {
    opacity: normalizeOpacity(undefined),
    startExpanded: false,
    clickThrough: false,
  };
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

function useArenaMetaMap(library: LiveCardCount[] | undefined) {
  const [tick, setTick] = useState(0);
  const ids = useMemo(
    () => (library ?? []).map((c) => c.grpId).sort((a, b) => a - b),
    [library],
  );
  const key = ids.join(",");

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
  const [opacity, setOpacity] = useState(() => readOverlayPrefs().opacity);
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
      const prefs = readOverlayPrefs();
      setOpacity(prefs.opacity);
      startExpandedRef.current = prefs.startExpanded;
      void applyClickThrough(prefs.clickThrough);
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
          const prefs = readOverlayPrefs();
          setOpacity(prefs.opacity);
          startExpandedRef.current = prefs.startExpanded;
          void applyClickThrough(prefs.clickThrough);
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
  const metaMap = useArenaMetaMap(live?.library);

  const groups = useMemo(
    () => groupLibrary(live?.library ?? [], (id) => metaMap.get(id)),
    [live?.library, metaMap],
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
            expandedH.current = Math.max(curH, MIN_EXPANDED_H);
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
    }
  }, [liveMatchId, livePhase, setCompactMode]);

  const [oppNamesTick, setOppNamesTick] = useState(0);
  useEffect(() => {
    const ids = live?.opponentSeen ?? [];
    if (!ids.length) return;
    let cancelled = false;
    void resolveArenaMetaBatch(ids).then(() => {
      if (!cancelled) setOppNamesTick((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [live?.matchId, live?.opponentSeen]);

  const oppGuessLabel = useMemo(() => {
    void oppNamesTick;
    if (!live?.opponentSeen?.length) return null;
    const bundle = loadMetaCache();
    if (!bundle) return null;
    const fmt = bundle.formats.find((f) => f.featured) ?? bundle.formats[0];
    if (!fmt) return null;
    const mode = /Traditional/i.test(live.eventId) ? "bo3" : "bo1";
    const decks = decksForMode(fmt, mode as "bo1" | "bo3", bundle.decks);
    const g = inferOpponentArchetype(
      live.opponentSeen,
      (id) => peekArenaMeta(id)?.name ?? null,
      decks,
      { minHits: 2, minConfidence: 0.35 },
    );
    return g ? g.archetype : null;
  }, [live, oppNamesTick]);

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

  const shellClass = [
    "overlay-shell",
    ended ? "is-ended" : "",
    ended && live.result ? `is-${live.result}` : "",
    compact ? "is-compact" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={shellClass}
      style={{ "--ov-alpha": opacity } as CSSProperties}
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
              <span className="overlay-opp-arch" title="Inferred from cards seen">
                {" "}
                · {oppGuessLabel}
              </span>
            ) : null}
          </span>
        </div>
        <div className="overlay-bar-stats" data-tauri-drag-region>
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
              {record.wr != null ? (
                <span
                  className="overlay-wr-line"
                  title={`${record.wr}% this season with this deck`}
                >
                  {record.wins}–{record.losses}
                </span>
              ) : null}
              <span className="overlay-mode-chip">
                {live.bestOf > 1 ? `Bo${live.bestOf}` : "Bo1"}
              </span>
              {playing ? <MatchClock startedAt={live.startedAt} /> : null}
            </span>
          </div>

          {groups.length > 0 ? (
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
        </>
      )}
    </div>
  );
}
