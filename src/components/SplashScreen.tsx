import { useEffect, useMemo, useState, type ReactNode } from "react";
import { APP_VERSION } from "../version";

const TIPS = [
  "Pulling today’s ranked lists…",
  "Scryfall-checking every card…",
  "Warming up Matchup Lab…",
  "Tailing Arena for your winrate…",
  "Netdeck dirty. Climb clean.",
];

const MIN_MS = 1600;
const FADE_MS = 520;

export function SplashScreen({
  ready,
  children,
}: {
  /** True when initial boot work is done (meta settled or failed). */
  ready: boolean;
  children: ReactNode;
}) {
  const [minElapsed, setMinElapsed] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const [gone, setGone] = useState(false);
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    const t = window.setTimeout(() => setMinElapsed(true), MIN_MS);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => {
      setTipIndex((i) => (i + 1) % TIPS.length);
    }, 900);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!ready || !minElapsed || fadeOut || gone) return;
    setFadeOut(true);
    const t = window.setTimeout(() => setGone(true), FADE_MS);
    return () => window.clearTimeout(t);
  }, [ready, minElapsed, fadeOut, gone]);

  const tip = useMemo(() => TIPS[tipIndex], [tipIndex]);

  return (
    <>
      {children}
      {!gone && (
        <div
          className={`splash-root${fadeOut ? " splash-exit" : ""}`}
          role="status"
          aria-live="polite"
          aria-busy={!ready}
          aria-label="Loading Filthy Net Deck"
        >
          <div className="splash-fx" aria-hidden="true">
            <div className="splash-orb splash-orb-a" />
            <div className="splash-orb splash-orb-b" />
            <div className="splash-orb splash-orb-c" />
            <div className="splash-grid" />
            <div className="splash-noise" />
          </div>

          <div className="splash-core">
            <div className="splash-ring" aria-hidden="true">
              <div className="splash-ring-spin" />
              <div className="splash-icon-wrap">
                <img src="/app-icon.png" alt="" width={72} height={72} />
              </div>
            </div>

            <div className="splash-copy">
              <p className="splash-eyebrow">
                <span className="splash-live-dot" />
                MTG Arena companion
              </p>
              <h1 className="splash-title">
                Filthy Net Deck
              </h1>
              <p className="splash-tagline">
                Netdeck dirty. <span>Climb clean.</span>
              </p>
              <p className="splash-tip" key={tipIndex}>
                {tip}
              </p>
            </div>

            <div className="splash-bar" aria-hidden="true">
              <div className="splash-bar-fill" />
            </div>

            <p className="splash-version">v{APP_VERSION}</p>
          </div>
        </div>
      )}
    </>
  );
}
