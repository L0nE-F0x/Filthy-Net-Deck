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
 * and Rust remembers the position. Only the dotted grip is the handle. Cog
 * clicks are hit-tested by coordinates as well as onClick (WebKitGTK often
 * delivers the event to the bar). The badge does not dismiss the menu on its
 * own blur: mapping the menu window blurs the badge, and a layer surface
 * never reports focused, which looked like a dead cog after a drag.
 *
 * Rust owns show/hide (driven by the Arena process watcher). The cog menu
 * is inline in this webview — the same pattern as the HUD ⚙. Layer-shell
 * grows the surface up so the pill stays put.
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
  noteLayerPosition,
  noteLayerSize,
} from "../overlay/layerDrag";
import { PresenceMenu } from "./PresenceMenu";
import { presenceCall } from "./presenceCall";
import { pointInRect } from "./presenceHit";
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
  const markRef = useRef<HTMLButtonElement | null>(null);
  const cogRef = useRef<HTMLButtonElement | null>(null);
  const lastSize = useRef("");
  const dragArmed = useRef(false);
  const pressAt = useRef<{ x: number; y: number } | null>(null);
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

  /**
   * Keep the OS window the size of the pill, or the pill + menu when open.
   * Layer-shell can grow the surface *up* (`presence_set_size` keeps the
   * bottom edge still); a second webview is how the menu used to never appear.
   */
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const report = () => {
      const bar = el.querySelector(".fnd-presence-bar");
      if (!bar) return;
      const barBox = bar.getBoundingClientRect();
      let width = barBox.width;
      let height = barBox.height;
      const menu = el.querySelector(".fnd-presence-menu");
      if (menu) {
        const menuBox = menu.getBoundingClientRect();
        if (menuBox.height > 1) {
          width = Math.max(width, menuBox.width);
          height = menuBox.height + 10 + barBox.height;
        }
      }
      width = Math.ceil(width) + 2;
      height = Math.ceil(height);
      const key = `${width}x${height}`;
      if (key === lastSize.current) return;
      lastSize.current = key;
      const anchored = layerMargins();
      const prev = layerSize();
      const payload: Record<string, unknown> = { width, height };
      if (anchored && prev) {
        const marginX = anchored.left;
        const marginY = Math.max(0, anchored.top + prev.height - height);
        payload.marginX = marginX;
        payload.marginY = marginY;
        noteLayerPosition(marginX, marginY);
      }
      noteLayerSize(width, height);
      void presenceCall("presence_set_size", payload);
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [inMatch, menuOpen]);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
  }, []);

  const openMenu = useCallback(() => {
    setMenuOpen(true);
  }, []);

  const toggleMenu = useCallback(() => {
    if (menuOpen) closeMenu();
    else openMenu();
  }, [menuOpen, closeMenu, openMenu]);

  // Linux/Wayland: a layer surface has no move request, so take over the
  // drag-region the same way the HUD does. Installs nothing on Windows,
  // macOS, X11, or `FND_LAYER_SHELL=0`.
  useEffect(() => {
    if (!tauri) return;
    void initLayerDrag({
      onDragEnd: () => {
        void closeMenu();
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
      if (e.key === "Escape") closeMenu();
    };
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest(".fnd-presence-menu")) return;
      if (target?.closest(".fnd-presence-cog")) return;
      closeMenu();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
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
      {menuOpen && (
        <PresenceMenu prefs={prefs} patch={patch} onRequestClose={() => closeMenu()} />
      )}

      <div
        className="fnd-presence-bar"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          pressAt.current = { x: e.clientX, y: e.clientY };
          const target = e.target as HTMLElement | null;
          if (!target?.closest(".fnd-presence-grip")) return;
          dragArmed.current = true;
          if (menuOpen) closeMenu();
        }}
        onPointerUp={(e) => {
          const start = pressAt.current;
          pressAt.current = null;
          if (dragArmed.current) {
            window.setTimeout(() => {
              dragArmed.current = false;
              void snapAndPersist();
            }, 80);
            return;
          }
          if (!start || e.button !== 0) return;
          if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) return;
          // WebKitGTK delivered this to the button — its onClick will fire.
          if ((e.target as HTMLElement | null)?.closest("button")) return;
          // Otherwise the click landed on the bar (transparent padding). Hit
          // the cog/mark by coordinates so the ⚙ still opens the menu.
          if (pointInRect(e.clientX, e.clientY, cogRef.current?.getBoundingClientRect())) {
            toggleMenu();
            return;
          }
          if (pointInRect(e.clientX, e.clientY, markRef.current?.getBoundingClientRect())) {
            void presenceCall("presence_open_main");
          }
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
          ref={markRef}
          className="fnd-presence-mark"
          data-tauri-drag-region="false"
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
          ref={cogRef}
          className={`fnd-presence-cog${menuOpen ? " is-open" : ""}`}
          data-tauri-drag-region="false"
          title={t("presence.cogTitle")}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            toggleMenu();
          }}
        >
          ⚙
        </button>
      </div>
    </div>
  );
}
