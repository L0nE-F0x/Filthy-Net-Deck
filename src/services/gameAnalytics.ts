/**
 * B2 — game-level personal analytics (pure, local, real data only).
 *
 * Everything else in Stats aggregates at match level. The tracker records
 * per-game `winningTeamId` + `onPlay`, which unlocks the honest versions of
 * the classic stats:
 *   - play vs draw winrate counted per GAME (not the g1-onPlay-vs-match proxy)
 *   - Bo3 pre-board (g1) vs post-board (g2/g3) winrate — sideboard signal
 *   - per-deck matchup table vs B1-inferred opponent archetypes
 *
 * Games without a recorded winner or on-play stamp are excluded, never guessed.
 */

import type { Deck } from "../types/meta";
import type { TrackedMatch } from "../types/tracker";
import {
  inferOpponentArchetype,
  type InferOptions,
  type NameResolver,
} from "./opponentArchetype";

export interface GameTally {
  wins: number;
  games: number;
  /** null until at least one counted game. */
  rate: number | null;
}

function emptyTally(): GameTally {
  return { wins: 0, games: 0, rate: null };
}

function addGame(t: GameTally, won: boolean) {
  t.games++;
  if (won) t.wins++;
  t.rate = t.wins / t.games;
}

/** Games with a decided winner, paired with whether the local player won. */
function decidedGames(m: TrackedMatch): { index: number; won: boolean }[] {
  const out: { index: number; won: boolean }[] = [];
  m.games.forEach((g, index) => {
    if (g.winningTeamId == null) return;
    out.push({ index, won: g.winningTeamId === m.myTeamId });
  });
  return out;
}

export interface PlayDrawSplit {
  play: GameTally;
  draw: GameTally;
  /** play.rate − draw.rate, null until both sides have games. */
  gap: number | null;
}

/**
 * Game-level play/draw winrate. Counts every game that has BOTH an on-play
 * stamp and a decided winner — including post-board games in Bo3.
 */
export function gamePlayDrawSplit(matches: TrackedMatch[]): PlayDrawSplit {
  const play = emptyTally();
  const draw = emptyTally();
  for (const m of matches) {
    for (const { index, won } of decidedGames(m)) {
      const onPlay = m.games[index]?.onPlay;
      if (onPlay == null) continue;
      addGame(onPlay ? play : draw, won);
    }
  }
  const gap =
    play.rate != null && draw.rate != null ? play.rate - draw.rate : null;
  return { play, draw, gap };
}

export interface SideboardSplit {
  /** Game 1s (pre-board). */
  g1: GameTally;
  /** Games 2+ (post-board). */
  post: GameTally;
  /** post.rate − g1.rate, null until both sides have games. */
  delta: number | null;
  /** Bo3 matches that contributed at least one decided game. */
  matchesConsidered: number;
}

/**
 * Bo3 pre-board vs post-board winrate. Bo1 matches are ignored — game 1 is
 * the whole match there and would double-count the play/draw story.
 */
export function sideboardSplit(matches: TrackedMatch[]): SideboardSplit {
  const g1 = emptyTally();
  const post = emptyTally();
  let matchesConsidered = 0;
  for (const m of matches) {
    if (m.bestOf !== 3) continue;
    const games = decidedGames(m);
    if (!games.length) continue;
    matchesConsidered++;
    for (const { index, won } of games) {
      addGame(index === 0 ? g1 : post, won);
    }
  }
  const delta = g1.rate != null && post.rate != null ? post.rate - g1.rate : null;
  return { g1, post, delta, matchesConsidered };
}

export interface DeckMatchupRow {
  archetype: string;
  /** Meta deck id for click-through when the guess matched a ranked list. */
  deckId: string | null;
  /** Match-level record. */
  wins: number;
  losses: number;
  rate: number | null;
  /** Game-level splits within this matchup. */
  g1: GameTally;
  post: GameTally;
}

/**
 * Personal matchup table for ONE tracked deck (caller pre-filters matches to
 * the deck). Opponent identity comes from B1 inference over cards actually
 * seen; matches with too little evidence are skipped, never bucketed.
 */
export function deckMatchupMatrix(
  deckMatches: TrackedMatch[],
  resolveName: NameResolver,
  candidates: Deck[],
  opts?: InferOptions,
): DeckMatchupRow[] {
  if (!candidates.length) return [];
  const by = new Map<string, DeckMatchupRow>();

  for (const m of deckMatches) {
    if (m.result !== "win" && m.result !== "loss") continue;
    const guess = inferOpponentArchetype(m.opponentSeen, resolveName, candidates, opts);
    if (!guess) continue;

    const row =
      by.get(guess.archetype) ??
      ({
        archetype: guess.archetype,
        deckId: guess.deckId,
        wins: 0,
        losses: 0,
        rate: null,
        g1: emptyTally(),
        post: emptyTally(),
      } satisfies DeckMatchupRow);

    if (m.result === "win") row.wins++;
    else row.losses++;
    row.rate = row.wins / (row.wins + row.losses);

    for (const { index, won } of decidedGames(m)) {
      addGame(index === 0 ? row.g1 : row.post, won);
    }
    by.set(guess.archetype, row);
  }

  return [...by.values()].sort(
    (a, b) =>
      b.wins + b.losses - (a.wins + a.losses) ||
      (b.rate ?? 0) - (a.rate ?? 0) ||
      a.archetype.localeCompare(b.archetype),
  );
}

/** "62%" / "—" formatting shared by the panel. */
export function pct(rate: number | null): string {
  return rate == null ? "—" : `${Math.round(rate * 100)}%`;
}

/** Signed percentage-point delta: "+9 pts" / "−4 pts". */
export function pts(delta: number | null): string {
  if (delta == null) return "—";
  const v = Math.round(delta * 100);
  return `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v)} pts`;
}
