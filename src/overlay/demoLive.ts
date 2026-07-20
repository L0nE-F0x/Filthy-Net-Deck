/**
 * Browser-only demo state for the overlay: open `/?demo#/overlay` in plain
 * vite dev to style/screenshot the HUD without Arena or Tauri. Real Arena
 * grpIds so card meta resolves from Scryfall. Never active inside Tauri —
 * OverlayApp gates the import on !isTauri().
 */
import type { LiveCardCount, LiveMatch, TrackedMatch } from "../types/tracker";

const row = (grpId: number, remaining: number, total: number): LiveCardCount => ({
  grpId,
  remaining,
  total,
});

/** Mono-red mid-game snapshot: turn 6, on the play, one mulligan. */
export function demoLiveMatch(): LiveMatch {
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
    phase: "playing",
    startedAt: Date.now() - 6 * 60_000 - 12_000,
    eventId: "Ladder",
    bestOf: 1,
    opponentName: "wraith",
    myPlayerName: "You",
    deckName: "Mono-Red Mice",
    deckId: "demo-deck",
    deckHash: "demo-hash",
    library,
    libraryTotal: library.reduce((n, c) => n + c.remaining, 0),
    opponentSeen: [105175, 92125, 92117, 92218, 91611, 86758],
    turn: 6,
    onPlay: true,
    mulligans: 1,
  };
}

/** Enough season history for the record chip (5–3 on this deck). */
export function demoMatches(): TrackedMatch[] {
  const now = Date.now();
  return Array.from({ length: 8 }, (_, i) => ({
    matchId: `demo-past-${i}`,
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
  }));
}
