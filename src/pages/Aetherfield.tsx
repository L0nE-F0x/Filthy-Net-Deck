import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "../i18n";
import { openExternal } from "../services/openExternal";

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
 * `?shell=play` skips Aetherfield's own title screen — the sidebar button was
 * already the "do you want this?" click.
 */

const SRC = "/aetherfield/index.html?shell=play";

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
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<Status>("booting");
  const [detail, setDetail] = useState<string | null>(null);
  // Changing this remounts the iframe, which is the only reliable way to retry
  // a boot: reloading in place keeps whatever half-initialised GL state failed.
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setStatus("booting");
    setDetail(null);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // A window receives everything anyone posts at it. Only listen to our
      // own frame, and only to messages wearing the channel tag.
      if (event.source !== frameRef.current?.contentWindow) return;
      if (!isAetherMessage(event.data)) return;

      switch (event.data.type) {
        case "ready":
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
  }, [attempt]);

  return (
    <div className="aether-frame-wrap">
      {status !== "failed" && (
        <iframe
          key={attempt}
          ref={frameRef}
          className="aether-frame"
          src={SRC}
          title={t("aether.title")}
        />
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
