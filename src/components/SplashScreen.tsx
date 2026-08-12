import { useEffect, useMemo, useState, type ReactNode } from "react";
import { APP_VERSION } from "../version";

const TIPS = [
  "Pulling today’s ranked lists…",
  "Double-checking every card…",
  // "Warming up Matchup Lab…" until v3.0.0 — Matchup Lab was replaced by
  // Matchups in v2.7.6 and the splash went on advertising it for four releases.
  "Reading your matchups…",
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

  // Tips only while the splash is visible — an open interval after `gone`
  // re-renders this shell (and the whole app tree under it) every 900ms forever.
  useEffect(() => {
    if (gone) return;
    const t = window.setInterval(() => {
      setTipIndex((i) => (i + 1) % TIPS.length);
    }, 900);
    return () => window.clearInterval(t);
  }, [gone]);

  // Start the fade once boot is done and the minimum has elapsed.
  useEffect(() => {
    if (!ready || !minElapsed) return;
    setFadeOut(true);
  }, [ready, minElapsed]);

  // Unmount one fade later.
  //
  // This MUST be its own effect. Both halves used to live together with
  // `fadeOut` in the dependency array and in the guard:
  //
  //     if (!ready || !minElapsed || fadeOut || gone) return;
  //     setFadeOut(true);
  //     const t = setTimeout(() => setGone(true), FADE_MS);
  //     return () => clearTimeout(t);
  //
  // which cancels its own unmount. Setting `fadeOut` re-runs the effect, the
  // cleanup clears the pending timeout, and the `|| fadeOut` guard then returns
  // before scheduling a new one. `gone` therefore never became true.
  //
  // Nothing looked wrong — the CSS still faded the splash to opacity 0 — but it
  // stayed mounted forever, which defeated BOTH mitigations below: the tips
  // interval kept ticking every 900 ms, and each tick re-rendered this wrapper
  // and with it the entire app tree, for the whole life of the process.
  // Measured on a production build 2026-08-12: five tips still cycling and ten
  // DOM mutations in a four-second window, two minutes after boot.
  //
  // Keyed on `fadeOut` alone, so setting it cannot cancel the timer it starts.
  useEffect(() => {
    if (!fadeOut) return;
    const t = window.setTimeout(() => setGone(true), FADE_MS);
    return () => window.clearTimeout(t);
  }, [fadeOut]);

  const tip = useMemo(() => TIPS[tipIndex], [tipIndex]);

  // Once the splash is dismissed, stop wrapping the tree so tip/fade state
  // can never force a full-app re-render again.
  if (gone) return <>{children}</>;

  return (
    <>
      {children}
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
            <h1 className="splash-title">Filthy Net Deck</h1>
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
    </>
  );
}
