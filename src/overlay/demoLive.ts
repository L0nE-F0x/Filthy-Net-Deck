/**
 * Browser-only demo state for the overlay: open `/?demo#/overlay` in plain
 * vite dev to style/screenshot the HUD without Arena or Tauri. Real Arena
 * grpIds so card meta resolves from Scryfall. Never active inside Tauri —
 * OverlayApp gates the import on !isTauri().
 *
 * Knobs: `&phase=ended` shows the post-match card instead of the live tracker,
 * `&fresh` cuts history to a single game so the card's day-one state (no
 * progression graph yet) is reachable.
 */
import type { LiveCardCount, LiveMatch, TrackedMatch } from "../types/tracker";

const row = (grpId: number, remaining: number, total: number): LiveCardCount => ({
  grpId,
  remaining,
  total,
});

/**
 * Mono-red mid-game snapshot: turn 6, on the play, one mulligan.
 * `?demo&phase=ended` finishes it instead, so the post-match card can be
 * styled without waiting on a real Arena result.
 */
export function demoLiveMatch(opts: { ended?: boolean } = {}): LiveMatch {
  const library: LiveCardCount[] = [
    row(105180, 12, 18), // Mountain
    row(91674, 2, 4), // Heartfire Hero
    row(82628, 3, 4), // Monastery Swiftspear
    row(91668, 4, 4), // Emberheart Challenger
    row(91679, 3, 4), // Manifold Mouse
    row(90492, 2, 4), // Slickshot Show-Off
    row(92243, 3, 3), // Screaming Nemesis
    row(105037, 4, 4), // Lightning Strike
    row(105819, 3, 4), // Shock
    row(93792, 2, 4), // Boltwave
    row(95623, 3, 4), // Cori-Steel Cutter
  ];
  return {
    matchId: "demo-match",
    phase: opts.ended ? "ended" : "playing",
    startedAt: Date.now() - 6 * 60_000 - 12_000,
    eventId: "Ladder",
    bestOf: 1,
    opponentName: "wraith",
    myPlayerName: "You",
    deckName: "Mono-Red Mice",
    deckId: "demo-deck",
    deckHash: "demo-hash",
    // The ended frame carries the rank the match *started* at (tracker.rs
    // stamps it on the pending match); `rankNow` is the one it earned, which
    // Arena logs a beat after the result.
    myRank: "Mythic 92.1%",
    rankNow: opts.ended ? "Mythic 92.6%" : undefined,
    result: opts.ended ? "win" : undefined,
    library: opts.ended ? [] : library,
    libraryTotal: opts.ended
      ? 0
      : library.reduce((n, c) => n + c.remaining, 0),
    opponentSeen: [105175, 92125, 92117, 92218, 91611, 86758],
    turn: opts.ended ? undefined : 6,
    onPlay: true,
    mulligans: 1,
  };
}

/**
 * One evening's ladder session on this deck (5–3), climbing through Mythic.
 * Hourly gaps keep it inside the 3h session window the post-match card scopes
 * to, and the ranked eventId + rank stamps are what the rank path needs.
 */
export function demoMatches(): TrackedMatch[] {
  const now = Date.now();
  // `&fresh`: day one with this deck — the graph should stay away.
  const n = new URLSearchParams(window.location.search).has("fresh") ? 1 : 8;
  return Array.from({ length: n }, (_, i) => ({
    // i === 0 is the newest — the match `demoLiveMatch` just finished, so the
    // post-match card can close its path on the live rank.
    matchId: i === 0 ? "demo-match" : `demo-past-${i}`,
    startedAt: now - (i + 1) * 3_600_000,
    endedAt: now - (i + 1) * 3_600_000 + 900_000,
    eventId: "Ladder",
    bestOf: 1,
    myTeamId: 1,
    games: [],
    result: (i % 3 === 1 ? "loss" : "win") as TrackedMatch["result"],
    deckName: "Mono-Red Mice",
    deckId: "demo-deck",
    deckHash: "demo-hash",
    // i counts backwards from now, so the earliest match sits lowest.
    myRank: `Mythic ${(92.1 - i * 0.22).toFixed(1)}%`,
  }));
}
