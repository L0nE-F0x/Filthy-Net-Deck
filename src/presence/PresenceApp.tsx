/**
 * Corner presence badge for the `presence` webview (src-tauri/src/presence.rs).
 *
 * Answers "is Filthy Net Deck actually running?" the whole time Arena is open —
 * the in-match HUD only shows up once a game starts, so the home screen and
 * deck builder used to give you nothing. Carries a cog with the overlay
 * settings worth changing *between* matches; the mid-match knobs stay on the
 * HUD's own pill.
 *
 * Default is bottom-left. The user drags it anywhere — same path as the HUD —
 * and Rust remembers the position. The grip (and the bar chrome around the
 * two buttons) is the handle; the mark and cog stay clicks.
 *
 * Rust owns show/hide (driven by the Arena process watcher). The cog menu is
 * a second window (`#/presence-menu`) so this surface stays badge-sized.
 * Browser demo (`/?demo#/presence`) still opens the menu inline.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { LiveMatch } from "../types/tracker";
import { isTauri } from "../services/appUpdater";
import { t as translate } from "../i18n/t";
import {
  initLayerDrag,
  layerMargins,
  layerReady,
  layerSize,
  moveLayerTo,
  noteLayerSize,
} from "../overlay/layerDrag";
import { PresenceMenu } from "./PresenceMenu";
import { presenceCall } from "./presenceCall";
import { usePresenceChrome } from "./usePresenceChrome";

const SNAP_PX = 24;

async function snapAndPersist(): Promise<void> {
  if (!isTauri()) return;
  await layerReady();
  try {
    const {
      getCurrentWindow,
      LogicalPosition,
      currentMonitor,
      primaryMonitor,
    } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    const factor = await win.scaleFactor();
    const anchored = layerMargins();
    const tracked = layerSize();
    const logicalW = tracked
      ? tracked.width
      : (await win.outerSize()).width / factor;
    const logicalH = tracked
      ? tracked.height
      : (await win.outerSize()).height / factor;

    if (anchored) {
      const monitor = (await currentMonitor()) ?? (await primaryMonitor());
      if (monitor) {
        const maxLeft = Math.max(
          0,
          monitor.size.width / factor - logicalW,
        );
        const maxTop = Math.max(
          0,
          monitor.size.height / factor - logicalH,
        );
        let { left, top } = anchored;
        if (left <= SNAP_PX) left = 0;
        else if (Math.abs(left - maxLeft) <= SNAP_PX) left = maxLeft;
        if (top <= SNAP_PX) top = 0;
        else if (Math.abs(top - maxTop) <= SNAP_PX) top = maxTop;
        left = Math.min(Math.max(0, left), maxLeft);
        top = Math.min(Math.max(0, top), maxTop);
        await moveLayerTo(left, top);
        await invoke("presence_save_geometry", {
          geometry: { x: left, y: top },
        });
      }
      return;
    }

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
    await invoke("presence_save_geometry", {
      geometry: { x: x / factor, y: y / factor },
    });
  } catch {
    /* ignore */
  }
}

export function PresenceApp() {
  const { prefs, patch } = usePresenceChrome();
  const t = translate;
  const [menuOpen, setMenuOpen] = useState(false);
  const [inMatch, setInMatch] = useState(false);
  const [hot, setHot] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const lastSize = useRef("");
  const dragArmed = useRef(false);
  const tauri = isTauri();

  // Match state only drives the dim — Rust decides whether we're visible.
  useEffect(() => {
    let unlistenLive: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      if (!tauri) return;
      try {
        const snap = await invoke<LiveMatch | null>("tracker_live");
        if (!cancelled) setInMatch(snap?.phase === "playing" || snap?.phase === "ended");
      } catch {
        /* ignore */
      }
      try {
        unlistenLive = await listen<LiveMatch | null>("tracker:live", (e) => {
          const p = e.payload?.phase;
          setInMatch(p === "playing" || p === "ended");
        });
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
      unlistenLive?.();
    };
  }, [tauri]);

  useEffect(() => {
    if (!tauri) return;
    let unlisten: (() => void) | undefined;
    void (async () => {
      try {
        unlisten = await listen<boolean>("presence:menu", (e) => {
          setMenuOpen(!!e.payload);
        });
      } catch {
        /* ignore */
      }
    })();
    return () => unlisten?.();
  }, [tauri]);

  /**
   * Keep the OS window exactly the size of the badge. Growing it around the
   * cog menu is what pushed the window off-screen on Wayland — the menu is
   * its own window now.
   */
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const report = () => {
      const bar = el.querySelector(".fnd-presence-bar");
      if (!bar) return;
      const barBox = bar.getBoundingClientRect();
      const width = Math.ceil(barBox.width);
      const height = Math.ceil(barBox.height);
      const key = `${width}x${height}`;
      if (key === lastSize.current) return;
      lastSize.current = key;
      noteLayerSize(width, height);
      void presenceCall("presence_set_size", { width, height });
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [inMatch]);

  const closeMenu = useCallback(
    (force = true) => {
      if (!tauri) {
        setMenuOpen(false);
        return;
      }
      void presenceCall(force ? "presence_close_menu" : "presence_close_menu_if_unfocused");
    },
    [tauri],
  );

  const openMenu = useCallback(() => {
    if (!tauri) {
      setMenuOpen(true);
      return;
    }
    const menu = measureRef.current?.querySelector(".fnd-presence-menu");
    const box = menu?.getBoundingClientRect();
    const width = Math.ceil(box?.width || 264);
    const height = Math.ceil(box?.height || 320);
    setMenuOpen(true);
    void presenceCall("presence_open_menu", { width, height });
  }, [tauri]);

  const toggleMenu = useCallback(() => {
    if (menuOpen) closeMenu(true);
    else openMenu();
  }, [menuOpen, closeMenu, openMenu]);

  // Linux/Wayland: a layer surface has no move request, so take over the
  // drag-region the same way the HUD does. Installs nothing on Windows,
  // macOS, X11, or `FND_LAYER_SHELL=0`.
  useEffect(() => {
    if (!tauri) return;
    void initLayerDrag({
      onDragEnd: () => {
        void closeMenu(true);
        void snapAndPersist();
      },
      geometryCommand: "presence_layer_geometry",
      setMarginsCommand: "presence_set_margins",
    });
  }, [tauri, closeMenu]);

  useEffect(() => {
    if (!tauri) return;
    let unlisten: (() => void) | undefined;
    let snapTimer = 0;
    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        unlisten = await getCurrentWindow().onMoved(() => {
          if (!dragArmed.current) return;
          window.clearTimeout(snapTimer);
          snapTimer = window.setTimeout(() => {
            void snapAndPersist();
          }, 140);
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      window.clearTimeout(snapTimer);
      unlisten?.();
    };
  }, [tauri]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu(true);
    };
    const onDown = (e: MouseEvent) => {
      if (tauri) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest(".fnd-presence-menu")) return;
      if (target?.closest(".fnd-presence-cog")) return;
      closeMenu(true);
    };
    const onBlur = () => {
      if (!tauri) {
        closeMenu(true);
        return;
      }
      window.setTimeout(() => closeMenu(false), 100);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("blur", onBlur);
    };
  }, [menuOpen, tauri, closeMenu]);

  const dimmed = inMatch && !hot && !menuOpen;

  return (
    <div
      ref={rootRef}
      className={`fnd-presence${dimmed ? " is-dim" : ""}${menuOpen ? " is-open" : ""}`}
      onMouseEnter={() => setHot(true)}
      onMouseLeave={() => setHot(false)}
    >
      {tauri && (
        <div className="fnd-presence-measure" ref={measureRef} aria-hidden="true">
          <PresenceMenu prefs={prefs} patch={patch} onRequestClose={() => undefined} inert />
        </div>
      )}
      {!tauri && menuOpen && (
        <PresenceMenu prefs={prefs} patch={patch} onRequestClose={() => closeMenu(true)} />
      )}

      <div
        className="fnd-presence-bar"
        data-tauri-drag-region
        onMouseDown={(e) => {
          const target = e.target as HTMLElement | null;
          if (target?.closest("button")) return;
          dragArmed.current = true;
          if (menuOpen) closeMenu(true);
        }}
        onMouseUp={() => {
          window.setTimeout(() => {
            if (!dragArmed.current) return;
            dragArmed.current = false;
            void snapAndPersist();
          }, 80);
        }}
      >
        <span
          className="fnd-presence-grip"
          data-tauri-drag-region
          title={t("presence.dragTitle")}
          aria-hidden="true"
        />
        <button
          type="button"
          className="fnd-presence-mark"
          title={t("presence.openTitle")}
          onClick={() => void presenceCall("presence_open_main")}
        >
          <img src="/app-icon.png" alt="" width={20} height={20} />
          <span className="fnd-presence-dot" aria-hidden="true" />
          <span className="fnd-presence-label">
            {inMatch ? "tracking" : "running"}
          </span>
        </button>
        <button
          type="button"
          className={`fnd-presence-cog${menuOpen ? " is-open" : ""}`}
          title={t("presence.cogTitle")}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={toggleMenu}
        >
          ⚙
        </button>
      </div>
    </div>
  );
}
