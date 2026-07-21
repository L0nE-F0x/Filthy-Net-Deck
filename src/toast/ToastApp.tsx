/**
 * Alert card for the top-most `toast` webview (see src-tauri/src/toast.rs).
 *
 * Rust owns show/hide of the window; this only paints the card and runs the
 * fade so the last ~450ms of the linger window isn't a hard cut. Browser demo:
 * `/?demo#/toast`.
 */
import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { bootThemeFromStorage } from "../services/theme";
import { isTauri } from "../services/appUpdater";
import { bodyParts, toneOf } from "./toastModel";

const TOAST_EVENT = "fnd:toast";
/** Head start on the Rust hide so the card fades instead of vanishing. */
const FADE_MS = 450;

interface ToastPayload {
  title: string;
  body: string;
  lingerMs: number;
}

export function ToastApp() {
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const [leaving, setLeaving] = useState(false);

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
      fadeTimer = window.setTimeout(
        () => setLeaving(true),
        Math.max(FADE_MS, p.lingerMs - FADE_MS),
      );
    };

    if (!isTauri()) {
      // Browser demo — style the card without Arena or a Tauri event.
      if (new URLSearchParams(window.location.search).has("demo")) {
        push({
          title: "Filthy Net Deck",
          body: "Win vs Rival · 62% this season · Mythic 95%",
          lingerMs: 60_000,
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

  if (!toast) return <div className="overlay-empty" />;

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
