/**
 * Corner presence badge for the `presence` webview (src-tauri/src/presence.rs).
 *
 * Answers "is Filthy Net Deck actually running?" the whole time Arena is open —
 * the in-match HUD only shows up once a game starts, so the home screen and
 * deck builder used to give you nothing. Carries a cog with the overlay
 * settings worth changing *between* matches; the mid-match knobs stay on the
 * HUD's own pill.
 *
 * Rust owns show/hide (driven by the Arena process watcher) and the window
 * resize around the menu. Browser demo: `/?demo#/presence`.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { LiveMatch } from "../types/tracker";
import { bootThemeFromStorage } from "../services/theme";
import { isTauri } from "../services/appUpdater";
import {
  PREFS_KEY,
  readOverlayPrefs,
  writeOverlayPrefs,
  type OverlayPrefs,
} from "../overlay/overlayPrefs";

/** Fire-and-forget command; older builds simply don't have it. */
async function call(cmd: string, args?: Record<string, unknown>) {
  if (!isTauri()) return;
  try {
    await invoke(cmd, args);
  } catch {
    /* command unavailable in browser / older builds */
  }
}

export function PresenceApp() {
  const [prefs, setPrefs] = useState<OverlayPrefs>(() => readOverlayPrefs());
  const [menuOpen, setMenuOpen] = useState(false);
  const [inMatch, setInMatch] = useState(false);
  const [hot, setHot] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const lastSize = useRef("");

  useEffect(() => {
    bootThemeFromStorage();
    document.documentElement.classList.add("overlay-root");
    document.body.classList.add("overlay-body");
    // macOS windows can't be transparent (see overlay.rs) — paint it opaque.
    if (/Mac OS X|Macintosh/.test(navigator.userAgent)) {
      document.documentElement.classList.add("overlay-macos");
    }
    return () => {
      document.documentElement.classList.remove("overlay-root");
      document.body.classList.remove("overlay-body");
      document.documentElement.classList.remove("overlay-macos");
    };
  }, []);

  // Match state only drives the dim — Rust decides whether we're visible.
  useEffect(() => {
    let unlistenLive: (() => void) | undefined;
    let unlistenPrefs: (() => void) | undefined;
    let cancelled = false;

    const onStorage = (e: StorageEvent) => {
      if (e.key === PREFS_KEY) setPrefs(readOverlayPrefs());
    };
    window.addEventListener("storage", onStorage);

    void (async () => {
      if (!isTauri()) return;
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
      try {
        // Reliable cross-webview prefs push (the `storage` event above is the
        // fallback — it does not always cross WebView2 windows).
        unlistenPrefs = await listen("prefs:overlay", () => {
          if (!cancelled) setPrefs(readOverlayPrefs());
        });
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
      unlistenLive?.();
      unlistenPrefs?.();
    };
  }, []);

  const toggleMenu = useCallback(() => setMenuOpen((open) => !open), []);

  /**
   * Keep the OS window exactly the size of what we paint. This window is
   * always on top of Arena, so every pixel it owns is a pixel Arena can't be
   * clicked through — measure the real content box and hand it to Rust, which
   * re-anchors to the bottom-left corner.
   */
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const report = () => {
      const bar = el.querySelector(".fnd-presence-bar");
      const menu = el.querySelector(".fnd-presence-menu");
      if (!bar) return;
      const barBox = bar.getBoundingClientRect();
      const menuBox = menu?.getBoundingClientRect();
      const width = Math.ceil(Math.max(barBox.width, menuBox?.width ?? 0));
      // 8px is the flex gap between the menu and the bar (see index.css).
      const height = Math.ceil(barBox.height + (menuBox ? menuBox.height + 8 : 0));
      // Resizing the window resizes the root, which re-fires the observer —
      // bail on a no-op so the two can't chase each other.
      const key = `${width}x${height}`;
      if (key === lastSize.current) return;
      lastSize.current = key;
      void call("presence_set_size", { width, height });
    };
    report();
    // Fonts/labels settle a frame late, and the menu animates in.
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [menuOpen, inMatch]);

  // Dismiss so the window shrinks back off Arena: click outside, Escape, or
  // clicking away into the game (which blurs this window).
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => {
      setMenuOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (menuRef.current?.contains(t)) return;
      // The cog runs its own toggle on click — closing here too would reopen it.
      if (t?.closest(".fnd-presence-cog")) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", close);
    };
  }, [menuOpen]);

  const patch = useCallback((p: Record<string, unknown>) => {
    writeOverlayPrefs(p);
    setPrefs(readOverlayPrefs());
  }, []);

  // Dim while a match is live — the HUD is the primary surface then. Hover
  // always wakes it, and an open menu is never dimmed.
  const dimmed = inMatch && !hot && !menuOpen;

  return (
    <div
      ref={rootRef}
      className={`fnd-presence${dimmed ? " is-dim" : ""}${menuOpen ? " is-open" : ""}`}
      onMouseEnter={() => setHot(true)}
      onMouseLeave={() => setHot(false)}
    >
      {menuOpen && (
        <div className="fnd-presence-menu" ref={menuRef} role="menu" aria-label="Overlay settings">
          <p className="fnd-presence-menu-title">Overlay</p>
          <label className="fnd-presence-row">
            <input
              type="checkbox"
              checked={prefs.overlayEnabled}
              onChange={(e) => {
                patch({ overlayEnabled: e.target.checked });
                void call("overlay_set_enabled", { enabled: e.target.checked });
              }}
            />
            <span>In-game overlay</span>
          </label>
          <label className="fnd-presence-row">
            <input
              type="checkbox"
              checked={prefs.postMatch}
              onChange={(e) => {
                patch({ overlayPostMatch: e.target.checked });
                void call("overlay_set_post_match", { enabled: e.target.checked });
              }}
            />
            <span>Post-match summary</span>
          </label>
          <label className="fnd-presence-slider">
            <span>Opacity</span>
            <input
              type="range"
              min={55}
              max={100}
              step={1}
              value={Math.round(prefs.opacity * 100)}
              onChange={(e) => patch({ overlayOpacity: Number(e.target.value) / 100 })}
              aria-label="Overlay opacity"
            />
            <em>{Math.round(prefs.opacity * 100)}%</em>
          </label>

          <p className="fnd-presence-menu-title">Alerts</p>
          <label className="fnd-presence-row">
            <input
              type="checkbox"
              checked={prefs.notifyTopmost}
              onChange={(e) => {
                patch({ notifyTopmost: e.target.checked });
                void call("toast_set_enabled", { enabled: e.target.checked });
              }}
            />
            <span>Show over fullscreen Arena</span>
          </label>

          <button
            type="button"
            className="fnd-presence-danger"
            title="The HUD ignores the mouse from now on — turn it back off in the main app (Settings → In-game overlay)"
            onClick={() => {
              patch({ overlayClickThrough: true });
              void call("overlay_set_click_through", { ignore: true });
              setMenuOpen(false);
            }}
          >
            Enable click-through
            <em>undo from the main app</em>
          </button>
          <button
            type="button"
            className="fnd-presence-open"
            onClick={() => {
              setMenuOpen(false);
              void call("presence_open_main");
            }}
          >
            Open Filthy Net Deck →
          </button>
        </div>
      )}

      <div className="fnd-presence-bar">
        <button
          type="button"
          className="fnd-presence-mark"
          title="Filthy Net Deck is running — click to open it"
          onClick={() => void call("presence_open_main")}
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
          title="Overlay settings"
          aria-expanded={menuOpen}
          onClick={toggleMenu}
        >
          ⚙
        </button>
      </div>
    </div>
  );
}
