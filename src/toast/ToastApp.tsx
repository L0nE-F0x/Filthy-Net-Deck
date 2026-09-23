/**
 * Alert card for the top-most `toast` webview (see src-tauri/src/toast.rs).
 *
 * Rust owns show/hide of the window; this only paints the card and runs the
 * fade so the last ~450ms of the linger window isn't a hard cut. Browser demo:
 * `/?demo#/toast` (`/?demo&move#/toast` for the placing card).
 *
 * A real alert is click-through, so it cannot be grabbed. `toast_move_mode`
 * pins a sample (`moving`) that takes the mouse: drag the grip — the same
 * path as the presence badge — then Done.
 */
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { bootThemeFromStorage } from "../services/theme";
import { isTauri } from "../services/appUpdater";
import { initLayerDrag, noteLayerPosition } from "../overlay/layerDrag";
import { snapAndPersist } from "../overlay/snapPersist";
import { presenceCall } from "../presence/presenceCall";
import { bodyParts, toneOf } from "./toastModel";

const TOAST_EVENT = "fnd:toast";
/** Head start on the Rust hide so the card fades instead of vanishing. */
const FADE_MS = 450;

interface ToastPayload {
  title: string;
  body: string;
  lingerMs: number;
  /** The pinned sample from `toast_move_mode` — takes the mouse, no linger. */
  moving?: boolean;
}

const persist = () => snapAndPersist("toast_save_geometry");

/** Back to the top-right corner; keep the margin drag's copy in step. */
async function resetPosition(): Promise<void> {
  try {
    const at = await invoke<{ x: number; y: number } | null>("toast_reset_position");
    if (at) noteLayerPosition(at.x, at.y);
  } catch {
    /* older build */
  }
}

export function ToastApp() {
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const [leaving, setLeaving] = useState(false);
  const dragArmed = useRef(false);
  const moving = toast?.moving === true;

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

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    let fadeTimer: number | undefined;

    const push = (p: ToastPayload) => {
      if (cancelled) return;
      window.clearTimeout(fadeTimer);
      setLeaving(false);
      setToast(p);
      // The placing card stays until Done; Rust closes it, not a timer.
      if (p.moving) return;
      fadeTimer = window.setTimeout(
        () => setLeaving(true),
        Math.max(FADE_MS, p.lingerMs - FADE_MS),
      );
    };

    if (!isTauri()) {
      // Browser demo — style the card without Arena or a Tauri event.
      const q = new URLSearchParams(window.location.search);
      if (q.has("demo")) {
        push({
          title: "Filthy Net Deck",
          body: q.has("move")
            ? "Drag the grip to place match alerts"
            : "Win vs Rival · 62% this season · Mythic 95%",
          lingerMs: 60_000,
          moving: q.has("move"),
        });
      }
    } else {
      void (async () => {
        const un = await listen<ToastPayload>(TOAST_EVENT, (e) => push(e.payload));
        if (cancelled) {
          un();
          return;
        }
        unlisten = un;
        // The alert that *built* this webview was emitted before the listener
        // above existed — pull it once so the first toast is never blank.
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          const pending = await invoke<ToastPayload | null>("toast_pending");
          if (pending && !cancelled) push(pending);
        } catch {
          /* command unavailable in older builds */
        }
      })();
    }

    return () => {
      cancelled = true;
      window.clearTimeout(fadeTimer);
      unlisten?.();
    };
  }, []);

  // Linux/Wayland: a layer surface has no move request, so the grip drives
  // anchor margins instead. Installs nothing anywhere else.
  useEffect(() => {
    if (!moving || !isTauri()) return;
    void initLayerDrag({
      onDragEnd: () => void persist(),
      geometryCommand: "toast_layer_geometry",
      setMarginsCommand: "toast_set_margins",
    });
  }, [moving]);

  // Native drag (Windows, macOS, X11): save once the window stops moving.
  // Only while the grip is held — Rust's own re-placing on show must not be
  // recorded as the user's choice.
  useEffect(() => {
    if (!moving || !isTauri()) return;
    let unlisten: (() => void) | undefined;
    let settle = 0;
    let gone = false;
    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const un = await getCurrentWindow().onMoved(() => {
          if (!dragArmed.current) return;
          window.clearTimeout(settle);
          settle = window.setTimeout(() => void persist(), 140);
        });
        if (gone) un();
        else unlisten = un;
      } catch {
        /* ignore */
      }
    })();
    return () => {
      gone = true;
      window.clearTimeout(settle);
      unlisten?.();
    };
  }, [moving]);

  if (!toast) return <div className="overlay-empty" />;

  if (moving) {
    return (
      <div
        className="fnd-toast is-neutral is-moving"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          const target = e.target as HTMLElement | null;
          dragArmed.current = !!target?.closest(".fnd-toast-grip");
        }}
        onPointerUp={() => {
          if (!dragArmed.current) return;
          window.setTimeout(() => {
            dragArmed.current = false;
            void persist();
          }, 80);
        }}
      >
        <span
          className="fnd-toast-grip"
          data-tauri-drag-region
          title="Drag to move"
          aria-hidden="true"
        />
        <div className="fnd-toast-body">
          <strong className="fnd-toast-title">Match alert</strong>
          <span className="fnd-toast-lead">Drag the grip to place it</span>
          <span className="fnd-toast-actions">
            <button
              type="button"
              className="fnd-toast-btn"
              data-tauri-drag-region="false"
              onClick={() => void resetPosition()}
            >
              Reset
            </button>
            <button
              type="button"
              className="fnd-toast-btn is-primary"
              data-tauri-drag-region="false"
              onClick={() => void presenceCall("toast_move_mode", { on: false })}
            >
              Done
            </button>
          </span>
        </div>
      </div>
    );
  }

  const { lead, rest } = bodyParts(toast.body);
  // Prose alerts (tray hint, Set Radar, B&R) have no "·" split — let the line
  // wrap instead of ellipsing a whole sentence away.
  const cls = [
    "fnd-toast",
    `is-${toneOf(toast.body)}`,
    rest.length === 0 ? "is-plain" : "",
    leaving ? "is-leaving" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls}>
      <div className="fnd-toast-accent" />
      <div className="fnd-toast-body">
        <strong className="fnd-toast-title">{toast.title}</strong>
        <span className="fnd-toast-lead">{lead}</span>
        {rest.length > 0 && <span className="fnd-toast-sub">{rest.join(" · ")}</span>}
      </div>
    </div>
  );
}
