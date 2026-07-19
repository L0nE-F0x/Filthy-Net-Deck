/**
 * Detect ladder rank-ups from consecutive tracked matches.
 * Pure helpers — no store / audio side effects.
 */
import { formatRank, parseRank, type ParsedRank } from "./ranks";
import type { TrackedMatch } from "../types/tracker";

export interface RankUpMoment {
  from: string;
  to: string;
  fromScore: number;
  toScore: number;
}

/**
 * Compare the new match's rank stamp against the best prior stamp in history.
 * Returns a moment when the new score is strictly higher (a real climb step).
 * Mythic % noise of < 0.5 score points is ignored as churn.
 */
export function detectRankUp(
  newMatch: TrackedMatch,
  priorMatches: TrackedMatch[],
): RankUpMoment | null {
  const next = parseRank(newMatch.myRank);
  if (!next) return null;

  let best: ParsedRank | null = null;
  for (const m of priorMatches) {
    const r = parseRank(m.myRank);
    if (!r) continue;
    if (!best || r.score > best.score) best = r;
  }
  if (!best) return null;

  // Require a real step: full division/tier, or ≥0.5 mythic score delta.
  const delta = next.score - best.score;
  if (delta < 0.5) return null;

  return {
    from: formatRank(best),
    to: formatRank(next),
    fromScore: best.score,
    toScore: next.score,
  };
}
