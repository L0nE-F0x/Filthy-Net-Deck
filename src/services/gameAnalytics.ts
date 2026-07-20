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
  /** Game-level play/draw within this matchup (onPlay stamp required). */
  play: GameTally;
  draw: GameTally;
  /**
   * Recent match results vs this archetype, oldest→newest within the last N
   * decided matches (W/L chars). Empty when no history.
   */
  form: string;
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
  opts?: InferOptions & { formWindow?: number },
): DeckMatchupRow[] {
  if (!candidates.length) return [];
  const formWindow = opts?.formWindow ?? 5;
  const by = new Map<string, DeckMatchupRow>();
  // Chronological for form strings.
  const chronological = [...deckMatches].sort((a, b) => a.endedAt - b.endedAt);

  for (const m of chronological) {
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
        play: emptyTally(),
        draw: emptyTally(),
        form: "",
      } satisfies DeckMatchupRow);

    if (m.result === "win") row.wins++;
    else row.losses++;
    row.rate = row.wins / (row.wins + row.losses);
    row.form = (row.form + (m.result === "win" ? "W" : "L")).slice(-formWindow);

    for (const { index, won } of decidedGames(m)) {
      addGame(index === 0 ? row.g1 : row.post, won);
      const onPlay = m.games[index]?.onPlay;
      if (onPlay == null) continue;
      addGame(onPlay ? row.play : row.draw, won);
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

/**
 * Compact form string for decided matches (oldest→newest), e.g. "WWLWL".
 * Pure; used by Stats form tiles and tests.
 */
export function recentFormString(
  matches: TrackedMatch[],
  window = 10,
): string {
  const decided = [...matches]
    .filter((m) => m.result === "win" || m.result === "loss")
    .sort((a, b) => a.endedAt - b.endedAt)
    .slice(-window);
  return decided.map((m) => (m.result === "win" ? "W" : "L")).join("");
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

export interface MulliganBucket {
  /** 0 = kept 7, 1 = one mull, … */
  mulls: number;
  games: number;
  wins: number;
  rate: number | null;
}

export interface MulliganStats {
  buckets: MulliganBucket[];
  /** Mean mulligans across stamped games. */
  avgMulligans: number | null;
  /** Fraction of stamped games that kept 7 (mulls === 0). */
  keep7Rate: number | null;
  gamesStamped: number;
}

/**
 * B2 — winrate by mulligans taken. Only games with a recorded mulligan
 * count *and* a decided winner are included.
 */
export function mulliganStats(matches: TrackedMatch[]): MulliganStats {
  const by = new Map<number, { games: number; wins: number }>();
  let sum = 0;
  let stamped = 0;
  let keep7 = 0;
  for (const m of matches) {
    for (const { index, won } of decidedGames(m)) {
      const mulls = m.games[index]?.mulligans;
      if (mulls == null || mulls < 0) continue;
      stamped++;
      sum += mulls;
      if (mulls === 0) keep7++;
      const row = by.get(mulls) ?? { games: 0, wins: 0 };
      row.games++;
      if (won) row.wins++;
      by.set(mulls, row);
    }
  }
  const buckets: MulliganBucket[] = [...by.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([mulls, r]) => ({
      mulls,
      games: r.games,
      wins: r.wins,
      rate: r.games ? r.wins / r.games : null,
    }));
  return {
    buckets,
    avgMulligans: stamped ? sum / stamped : null,
    keep7Rate: stamped ? keep7 / stamped : null,
    gamesStamped: stamped,
  };
}

export interface FirstLandStats {
  avgTurn: number | null;
  /** First land on turn 1–2. */
  early: GameTally;
  /** First land on turn 3. */
  on3: GameTally;
  /** First land on turn 4+. */
  late: GameTally;
  gamesStamped: number;
}

/**
 * B2 — winrate by when the first land hit the battlefield.
 * Games without a first-land stamp are skipped.
 */
export function firstLandStats(matches: TrackedMatch[]): FirstLandStats {
  const early = emptyTally();
  const on3 = emptyTally();
  const late = emptyTally();
  let sum = 0;
  let stamped = 0;
  for (const m of matches) {
    for (const { index, won } of decidedGames(m)) {
      const turn = m.games[index]?.firstLandTurn;
      if (turn == null || turn < 1) continue;
      stamped++;
      sum += turn;
      if (turn <= 2) addGame(early, won);
      else if (turn === 3) addGame(on3, won);
      else addGame(late, won);
    }
  }
  return {
    avgTurn: stamped ? sum / stamped : null,
    early,
    on3,
    late,
    gamesStamped: stamped,
  };
}
