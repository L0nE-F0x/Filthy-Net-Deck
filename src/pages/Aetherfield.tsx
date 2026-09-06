import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "../i18n";
import { openExternal } from "../services/openExternal";
import { resolveArenaCardNames } from "../services/arenaCards";
import { useAppStore } from "../store/useAppStore";

/**
 * Aetherfield — every printed Magic card as an explorable galaxy.
 *
 * The visualisation is a separate app (its own repo, three.js, custom GLSL, a
 * 6 MB star catalogue), vendored as a built folder by `npm run aetherfield`
 * and shown here in a same-origin iframe.
 *
 * It is deliberately *not* merged into this bundle. It assumes it owns the
 * document — a fixed full-viewport canvas, `overflow: hidden` on body, its own
 * global key handlers — so inside `.content` it would fight Tailwind, the
 * nav's 1–8 keys and Ctrl+K. A frame hands it a document to own, and shares no
 * dependency with this app that merging could deduplicate.
 *
 * The frame is mounted only while this page is open: navigating away unmounts
 * it, and the WebGL context and render loop die with the document. Nothing
 * keeps drawing a galaxy behind the rest of the app.
 *
 * The sidebar launch has no query string, so Aetherfield opens on its own
 * title (Enter / Tour / Settings). Sets and DeckView pass `shell=play` plus
 * `set=` / `cards=` — those clicks already said where to go, so a second
 * title would be a door to walk through twice. Install stays hidden in the
 * frame: Aetherfield's `isEmbedded()` gates it.
 */

const BASE = "/aetherfield/index.html";

/** Iframe URL. Empty query → title screen; Sets/DeckView pass their own. */
export function aetherFrameSrc(query: string): string {
  return query ? `${BASE}?${query}` : BASE;
}

/**
 * True when the iframe URL already names a deck. Collection overlay must not
 * replace that highlight — `highlight` is wholesale, so posting the cards this
 * machine has played would throw away the deck the user just asked to see.
 */
export function queryPinsDeck(query: string): boolean {
  return /(?:^|&)cards=/.test(query);
}

/**
 * How long to wait for the ready ping before calling it dead.
 *
 * There is no cheaper signal to wait on: an iframe fires `load` for a 404 page
 * just as happily as for a real one, so a missing `public/aetherfield/` looks
 * identical to a successful boot from out here. Generous, because the first
 * run reads 6 MB off disk and compiles shaders.
 */
const BOOT_TIMEOUT_MS = 45_000;

/** The other half of `src/core/embed.ts` in the Aetherfield repo. */
type AetherMessage =
  | { source: "aetherfield"; type: "ready"; cards: number }
  | { source: "aetherfield"; type: "error"; message: string }
  | { source: "aetherfield"; type: "open-external"; url: string };

function isAetherMessage(data: unknown): data is AetherMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { source?: unknown }).source === "aetherfield" &&
    typeof (data as { type?: unknown }).type === "string"
  );
}

type Status = "booting" | "ready" | "failed";

export function Aetherfield() {
  const { t } = useLocale();
  const aetherQuery = useAppStore((s) => s.aetherQuery);
  const trackerMatches = useAppStore((s) => s.trackerMatches);
  const src = aetherFrameSrc(aetherQuery);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<Status>("booting");
  const [detail, setDetail] = useState<string | null>(null);
  /**
   * Immersive mode: the galaxy takes the whole window, sidebar and topbar
   * included. Deliberately not the browser Fullscreen API — this is a desktop
   * app whose window is already the screen when the user wants it to be (F11),
   * and a real fullscreen request inside a webview leaves no chrome to come
   * back through. Hiding the app's own chrome gets the same picture and keeps
   * an obvious way out.
   */
  const [immersive, setImmersive] = useState(false);
  // Changing this remounts the iframe, which is the only reliable way to retry
  // a boot: reloading in place keeps whatever half-initialised GL state failed.
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setStatus("booting");
    setDetail(null);
    setAttempt((n) => n + 1);
  }, []);

  // The class lives on the shell, which is outside this component's tree.
  useEffect(() => {
    const shell = document.querySelector(".app-shell");
    if (!shell) return;
    shell.classList.toggle("app-shell--immersive", immersive);
    // Leaving the page while immersive would stick the whole app in it.
    return () => shell.classList.remove("app-shell--immersive");
  }, [immersive]);

  useEffect(() => {
    if (!immersive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setImmersive(false);
    };
    // Capture: Aetherfield uses Escape itself, and the frame swallows keys that
    // reach it, so the host has to see this one first.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [immersive]);

  /**
   * One listener and one boot timeout per mounted frame.
   *
   * The deps are exactly what remounts the iframe — its `key` is
   * `attempt`-`src` — and nothing else. Keying this to the tracker instead
   * restarted the 45 s timer on every poll that changed a match, so during a
   * game a genuinely dead frame never reached the fallback.
   */
  useEffect(() => {
    // A new `src` is a new document, so the last boot's verdict does not carry
    // over. Without this a src-driven remount would leave `status` at "ready"
    // with nothing armed to notice the new frame never booting.
    setStatus("booting");
    setDetail(null);

    const onMessage = (event: MessageEvent) => {
      // A window receives everything anyone posts at it. Only listen to our
      // own frame, and only to messages wearing the channel tag.
      if (event.source !== frameRef.current?.contentWindow) return;
      if (!isAetherMessage(event.data)) return;

      switch (event.data.type) {
        case "ready":
          // The collection push hangs off `status`, below.
          setStatus("ready");
          break;
        case "error":
          setDetail(event.data.message);
          setStatus("failed");
          break;
        case "open-external":
          // `target="_blank"` does nothing inside a Tauri webview, so the
          // galaxy's Scryfall links arrive here to be opened for real.
          void openExternal(event.data.url);
          break;
      }
    };

    window.addEventListener("message", onMessage);
    const timer = window.setTimeout(() => {
      setStatus((s) => (s === "booting" ? "failed" : s));
    }, BOOT_TIMEOUT_MS);

    return () => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timer);
    };
  }, [attempt, src]);

  /**
   * Hand the galaxy what this machine has played — on boot, and again whenever
   * the tracker learns something new. The tracker gains matches while the page
   * sits open, and a highlight frozen at boot goes quietly stale. `highlight`
   * replaces the galaxy's set wholesale, so re-sending it is idempotent — and
   * that is also why a deck deep-link must skip this: posting the collection
   * would throw the deck away.
   */
  useEffect(() => {
    if (status !== "ready") return;
    if (queryPinsDeck(aetherQuery)) return;
    let cancelled = false;
    void pushCollection(
      frameRef.current?.contentWindow,
      trackerMatches,
      () => cancelled,
    );
    return () => {
      cancelled = true;
    };
  }, [status, trackerMatches, aetherQuery]);

  return (
    <div className="aether-frame-wrap">
      {status !== "failed" && (
        <>
          <iframe
            key={`${attempt}-${src}`}
            ref={frameRef}
            className="aether-frame"
            src={src}
            title={t("aether.title")}
          />
          {/*
            Bottom-right: the one corner Aetherfield's own UI leaves empty.
            Top-right holds its search and Settings, bottom-centre its layout
            switcher, and the left is the filter panel.
          */}
          <button
            type="button"
            className="aether-expand"
            onClick={() => setImmersive((v) => !v)}
            title={immersive ? t("aether.collapseHint") : t("aether.expandHint")}
            aria-pressed={immersive}
          >
            {immersive ? (
              <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
                <path d="M6.5 1.5v5h-5M9.5 14.5v-5h5" fill="none" stroke="currentColor"
                      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
                <path d="M1.5 6.5v-5h5M14.5 9.5v5h-5" fill="none" stroke="currentColor"
                      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            {immersive ? t("aether.collapse") : t("aether.expand")}
          </button>
        </>
      )}
      {status === "failed" && (
        <div className="aether-fallback">
          <h2>{t("aether.failed")}</h2>
          <p>{detail ?? t("aether.missing")}</p>
          <button type="button" className="btn btn-primary" onClick={retry}>
            {t("aether.retry")}
          </button>
        </div>
      )}
    </div>
  );
}

async function pushCollection(
  win: Window | null | undefined,
  matches: { deckMain?: number[]; deckSide?: number[] }[],
  cancelled?: () => boolean,
): Promise<void> {
  if (!win) return;
  const ids: number[] = [];
  for (const m of matches) {
    if (m.deckMain) ids.push(...m.deckMain);
    if (m.deckSide) ids.push(...m.deckSide);
  }
  if (ids.length === 0) return;
  const names = await resolveArenaCardNames(ids);
  // Names resolve from cache or from Scryfall, so two pushes can finish out of
  // order. The one that was superseded mid-resolve must not post the older set.
  if (cancelled?.()) return;
  const unique = [...new Set(Object.values(names))].filter(Boolean);
  if (unique.length === 0) return;
  win.postMessage({ source: "aetherfield", type: "highlight", names: unique }, "*");
}
