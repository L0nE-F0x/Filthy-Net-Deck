/**
 * Corner presence badge for the `presence` webview (src-tauri/src/presence.rs).
 *
 * Answers "is Filthy Net Deck actually running?" the whole time Arena is open —
 * the in-match HUD only shows up once a game starts, so the home screen and
 * deck builder used to give you nothing. Carries a cog with the overlay
 * settings worth changing *between* matches; the mid-match knobs stay on the
 * HUD's own pill.
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
import { PresenceMenu } from "./PresenceMenu";
import { presenceCall } from "./presenceCall";
import { usePresenceChrome } from "./usePresenceChrome";

export function PresenceApp() {
  const { prefs, patch } = usePresenceChrome();
  const [menuOpen, setMenuOpen] = useState(false);
  const [inMatch, setInMatch] = useState(false);
  const [hot, setHot] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const lastSize = useRef("");
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

      <div className="fnd-presence-bar">
        <button
          type="button"
          className="fnd-presence-mark"
          title="Filthy Net Deck is running — click to open it"
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
          title="Overlay settings"
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
