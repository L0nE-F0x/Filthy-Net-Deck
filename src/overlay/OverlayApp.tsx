import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const SNAP_PX = 24;

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

/** Next-draw chance for at least this many copies still in library. */
function drawPct(remaining: number, libraryTotal: number): number | null {
  if (libraryTotal <= 0 || remaining <= 0) return null;
  return Math.round((remaining / libraryTotal) * 1000) / 10; // one decimal
}

async function persistGeometry() {
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
        height: size.height / factor,
      },
    });
  } catch {
    /* ignore */
  }
}

async function snapToEdges() {
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
    await persistGeometry();
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

type RowProps = {
  card: LiveCardCount;
  meta: ArenaCardMeta | null | undefined;
  libraryTotal: number;
};

const CardRow = memo(function CardRow({ card, meta, libraryTotal }: RowProps) {
  const label = meta?.name ?? `Card ${card.grpId}`;
  const pct = drawPct(card.remaining, libraryTotal);
  const art = meta?.artUrl;
  return (
    <li className={`overlay-card-row${meta?.isLand ? " is-land" : ""}`}>
      <span className="overlay-card-qty">{card.remaining}</span>
      {art ? (
        <img
          className="overlay-card-art"
          src={art}
          alt=""
          width={28}
          height={40}
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
      <span className="overlay-card-pct" title="Chance this is the next card drawn">
        {pct != null ? `${pct}%` : "—"}
      </span>
    </li>
  );
});

export function OverlayApp() {
  const [live, setLive] = useState<LiveMatch | null>(null);
  const [matches, setMatches] = useState<TrackedMatch[]>([]);
  /** Default collapsed — far less invasive; expand for full tracker. */
  const [compact, setCompact] = useState(true);
  const dragArmed = useRef(false);
  const liveRaf = useRef(0);
  const pendingLive = useRef<LiveMatch | null | undefined>(undefined);

  useEffect(() => {
    bootThemeFromStorage();
    document.documentElement.classList.add("overlay-root");
    document.body.classList.add("overlay-body");
    return () => {
      document.documentElement.classList.remove("overlay-root");
      document.body.classList.remove("overlay-body");
    };
  }, []);

  useEffect(() => {
    let unlistenLive: (() => void) | undefined;
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

      if (isTauri()) {
        try {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          const win = getCurrentWindow();
          unlistenMoved = await win.onMoved(() => {
            if (!dragArmed.current) return;
            window.clearTimeout(snapTimer);
            snapTimer = window.setTimeout(() => void snapToEdges(), 140);
          });
          unlistenResized = await win.onResized(() => {
            window.clearTimeout(snapTimer);
            snapTimer = window.setTimeout(() => void persistGeometry(), 200);
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
      unlistenMoved?.();
      unlistenResized?.();
    };
  }, []);

  const record = useMemo(() => seasonRecord(matches, live), [matches, live]);
  const metaMap = useArenaMetaMap(live?.library);

  const landStats = useMemo(() => {
    const library = live?.library ?? [];
    let rem = 0;
    let total = 0;
    let known = false;
    for (const c of library) {
      const m = metaMap.get(c.grpId);
      if (m?.isLand) {
        known = true;
        rem += c.remaining;
        total += c.total;
      }
    }
    // Also count exhausted lands (not in library list once remaining=0).
    // We only see remaining>0 rows — total lands from opening is best-effort.
    return known ? { rem, total } : null;
  }, [live?.library, metaMap]);

  const sortedLibrary = useMemo(() => {
    const library = [...(live?.library ?? [])];
    // Lands first, then by draw% desc, then name.
    library.sort((a, b) => {
      const ma = metaMap.get(a.grpId);
      const mb = metaMap.get(b.grpId);
      const la = ma?.isLand ? 0 : 1;
      const lb = mb?.isLand ? 0 : 1;
      if (la !== lb) return la - lb;
      if (b.remaining !== a.remaining) return b.remaining - a.remaining;
      const na = ma?.name ?? "";
      const nb = mb?.name ?? "";
      return na.localeCompare(nb);
    });
    return library;
  }, [live?.library, metaMap]);

  const onDragHandleDown = useCallback(() => {
    dragArmed.current = true;
  }, []);
  const onDragHandleUp = useCallback(() => {
    window.setTimeout(() => {
      dragArmed.current = false;
      void snapToEdges();
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
            window.setTimeout(() => void persistGeometry(), 200);
          } catch {
            /* ignore */
          }
        })();
      },
    [],
  );

  if (!live || live.phase === "idle") {
    return <div className="overlay-empty" />;
  }

  const opp = live.opponentName?.trim() || "Opponent";
  const deck = live.deckName?.trim() || "…";
  const libTotal = live.libraryTotal ?? 0;
  const resultLine =
    live.phase === "ended" && live.result
      ? live.result === "win"
        ? "W"
        : live.result === "loss"
          ? "L"
          : live.result === "draw"
            ? "D"
            : "·"
      : null;

  const landPct =
    landStats && libTotal > 0
      ? Math.round((landStats.rem / libTotal) * 1000) / 10
      : null;

  return (
    <div
      className={`overlay-shell${live.phase === "ended" ? " is-ended" : ""}${compact ? " is-compact" : ""}`}
    >
      <div className="overlay-resize overlay-resize-n" onMouseDown={startResize("North")} />
      <div className="overlay-resize overlay-resize-s" onMouseDown={startResize("South")} />
      <div className="overlay-resize overlay-resize-e" onMouseDown={startResize("East")} />
      <div className="overlay-resize overlay-resize-w" onMouseDown={startResize("West")} />
      <div
        className="overlay-resize overlay-resize-se"
        onMouseDown={startResize("SouthEast")}
      />

      <header
        className="overlay-bar"
        data-tauri-drag-region
        onMouseDown={onDragHandleDown}
        onMouseUp={onDragHandleUp}
      >
        <div className="overlay-bar-main" data-tauri-drag-region>
          {resultLine ? (
            <span className={`overlay-pill overlay-pill--${live.result}`}>
              {resultLine}
            </span>
          ) : null}
          <span className="overlay-opp-line" data-tauri-drag-region>
            {opp}
          </span>
        </div>
        <div className="overlay-bar-stats" data-tauri-drag-region>
          {libTotal > 0 ? (
            <span className="overlay-stat" title="Cards left in library">
              {libTotal}
            </span>
          ) : null}
          {landStats ? (
            <span
              className="overlay-stat overlay-stat--land"
              title={`Lands left ${landStats.rem}${landPct != null ? ` · ${landPct}% of library` : ""}`}
            >
              {landStats.rem}L
              {landPct != null ? (
                <em>{landPct}%</em>
              ) : null}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          className="overlay-icon-btn"
          title={compact ? "Expand deck tracker" : "Collapse to bar"}
          onClick={(e) => {
            e.stopPropagation();
            setCompact((c) => !c);
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
            {record.wr != null ? (
              <span className="overlay-wr-line">
                {record.wins}–{record.losses}
              </span>
            ) : null}
          </div>

          {sortedLibrary.length > 0 ? (
            <ul className="overlay-decklist">
              {sortedLibrary.map((c) => (
                <CardRow
                  key={c.grpId}
                  card={c}
                  meta={metaMap.get(c.grpId)}
                  libraryTotal={libTotal}
                />
              ))}
            </ul>
          ) : (
            <p className="overlay-hint">
              Waiting for deck list (Detailed Logs on).
            </p>
          )}
        </>
      )}
    </div>
  );
}
