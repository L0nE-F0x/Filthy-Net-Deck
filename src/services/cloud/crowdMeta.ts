/**
 * Community matchup data — Phase 2 slice 6, the payoff.
 * Design: `docs/BACKEND-PHASE-2.md` §3.
 *
 * Reads `matchup_rollup` only, never raw matches: egress then scales with
 * readers rather than with the volume of uploads, and no user's history is ever
 * exposed to another.
 *
 * The honesty rules here are the same ones `build-meta.mjs` already enforces on
 * the scraped feed, and they are not optional — a crowd number presented
 * without its sample size is exactly the fabrication the product promises not
 * to do.
 */

import { labelFromSlug } from "./archetypeSlug";

/** Below this, a cell is suppressed entirely rather than shown as a percentage. */
export const MIN_GAMES = 30;

export interface RollupRow {
  format: string;
  best_of: number;
  a_archetype: string;
  b_archetype: string;
  games: number;
  a_wins: number;
  a_on_play_games: number;
  a_on_play_wins: number;
  contributors: number;
}

export interface Matchup {
  /** The archetype the rate is *for*. */
  subject: string;
  subjectLabel: string;
  opponent: string;
  opponentLabel: string;
  games: number;
  wins: number;
  /** Point estimate, 0–100. Only meaningful alongside `low`/`high`. */
  winrate: number;
  /** 95% Wilson bounds, 0–100. */
  low: number;
  high: number;
  contributors: number;
}

/**
 * Wilson score interval — not `wins / games`.
 *
 * A 7–3 record is not "70%". The naive proportion is wildly overconfident on
 * small samples, which is precisely where crowd data starts out, so the
 * interval is what gets rendered.
 */
export function wilson(wins: number, games: number): { low: number; high: number } {
  if (games <= 0) return { low: 0, high: 0 };
  const z = 1.96;
  const p = wins / games;
  const denom = 1 + (z * z) / games;
  const centre = p + (z * z) / (2 * games);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * games)) / games);
  return {
    low: Math.max(0, ((centre - margin) / denom) * 100),
    high: Math.min(100, ((centre + margin) / denom) * 100),
  };
}

/**
 * Orient a stored row toward `subject`. Rows are stored canonically (a < b), so
 * a deck's own matchup list needs the mirror when it sits on the b side.
 */
export function orient(row: RollupRow, subject: string): Matchup | null {
  const isA = row.a_archetype === subject;
  const isB = row.b_archetype === subject;
  if (!isA && !isB) return null;

  const opponent = isA ? row.b_archetype : row.a_archetype;
  const wins = isA ? row.a_wins : row.games - row.a_wins;
  const { low, high } = wilson(wins, row.games);

  return {
    subject,
    subjectLabel: labelFromSlug(subject),
    opponent,
    opponentLabel: labelFromSlug(opponent),
    games: row.games,
    wins,
    winrate: (wins / row.games) * 100,
    low,
    high,
    contributors: row.contributors,
  };
}

/** Cells with too little data are dropped, never rendered as a number. */
export function usable(m: Matchup): boolean {
  return m.games >= MIN_GAMES;
}

/**
 * A deck's matchup table: strongest first, thin cells removed.
 * Returns both so the UI can honestly say "and N more still gathering data".
 */
export function matchupsFor(
  rows: readonly RollupRow[],
  subject: string,
): { shown: Matchup[]; suppressed: number } {
  const all = rows.map((r) => orient(r, subject)).filter((m): m is Matchup => m !== null);
  const shown = all.filter(usable).sort((a, b) => b.winrate - a.winrate || b.games - a.games);
  return { shown, suppressed: all.length - shown.length };
}

/** "58% (±9) · 142 games" — never a bare percentage. */
export function describe(m: Matchup): string {
  const pm = Math.round((m.high - m.low) / 2);
  return `${Math.round(m.winrate)}% (±${pm}) · ${m.games} games`;
}
