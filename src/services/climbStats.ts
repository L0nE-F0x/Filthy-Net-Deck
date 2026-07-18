/**
 * Climb polish helpers — win/loss streaks and season-over-season comparison.
 * Pure functions over TrackedMatch, so they're unit-testable and reusable.
 *
 * Match order convention: the store keeps matches newest-first. These helpers
 * accept whatever order and sort internally where order matters.
 */
import type { TrackedMatch } from "../types/tracker";
import { parseRank } from "./ranks";
import { seasonKeyOf } from "./tracker";

export interface Streak {
  type: "win" | "loss" | null;
  length: number;
}

/** Current run of same-result decided matches, ending at the latest match. */
export function currentStreak(matches: TrackedMatch[]): Streak {
  const decided = [...matches]
    .filter((m) => m.result === "win" || m.result === "loss")
    .sort((a, b) => b.endedAt - a.endedAt); // newest first
  if (!decided.length) return { type: null, length: 0 };
  const type = decided[0].result as "win" | "loss";
  let length = 0;
  for (const m of decided) {
    if (m.result === type) length++;
    else break;
  }
  return { type, length };
}

/** Longest run of the given result anywhere in the range. */
export function longestStreak(matches: TrackedMatch[], type: "win" | "loss"): number {
  const decided = [...matches]
    .filter((m) => m.result === "win" || m.result === "loss")
    .sort((a, b) => a.endedAt - b.endedAt);
  let best = 0;
  let run = 0;
  for (const m of decided) {
    if (m.result === type) {
      run++;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}

export interface SeasonSummary {
  seasonKey: string;
  games: number;
  wins: number;
  losses: number;
  rate: number | null;
  /** Best rank score reached in the season, or null when no ranks stamped. */
  peakScore: number | null;
  /** Net rank score change first→last stamped rank in the season. */
  delta: number | null;
}

function summarizeSeason(seasonKey: string, matches: TrackedMatch[]): SeasonSummary {
  const wins = matches.filter((m) => m.result === "win").length;
  const losses = matches.filter((m) => m.result === "loss").length;
  const decided = wins + losses;
  const ranked = matches
    .map((m) => ({ at: m.endedAt, rank: parseRank(m.myRank) }))
    .filter((r): r is { at: number; rank: NonNullable<ReturnType<typeof parseRank>> } =>
      r.rank != null,
    )
    .sort((a, b) => a.at - b.at);
  const peakScore = ranked.length
    ? ranked.reduce((best, r) => Math.max(best, r.rank.score), ranked[0].rank.score)
    : null;
  const delta =
    ranked.length >= 2 ? ranked[ranked.length - 1].rank.score - ranked[0].rank.score : null;
  return {
    seasonKey,
    games: matches.length,
    wins,
    losses,
    rate: decided > 0 ? wins / decided : null,
    peakScore,
    delta,
  };
}

/** Per-season summaries, most recent season first. */
export function seasonSummaries(matches: TrackedMatch[]): SeasonSummary[] {
  const bySeason = new Map<string, TrackedMatch[]>();
  for (const m of matches) {
    const k = seasonKeyOf(m.endedAt);
    const list = bySeason.get(k) ?? [];
    list.push(m);
    bySeason.set(k, list);
  }
  return [...bySeason.entries()]
    .map(([k, list]) => summarizeSeason(k, list))
    .sort((a, b) => b.seasonKey.localeCompare(a.seasonKey));
}

/**
 * The season immediately before `seasonKey` (by calendar order), or null.
 * Used to render a "vs last season" comparison for the selected season.
 */
export function previousSeasonSummary(
  matches: TrackedMatch[],
  seasonKey: string,
): SeasonSummary | null {
  const all = seasonSummaries(matches);
  const idx = all.findIndex((s) => s.seasonKey === seasonKey);
  if (idx < 0 || idx + 1 >= all.length) return null;
  return all[idx + 1];
}
