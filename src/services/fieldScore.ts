/**
 * Meta-weighted "vs the field" expected WR from personal B1 matchup rows ×
 * today's meta shares. Real data only; null when sample is too thin.
 */

import type { Deck } from "../types/meta";
import type { DeckMatchupRow } from "./gameAnalytics";

export interface FieldScore {
  /** 0–1 expected win rate if matchups faced in meta proportion. */
  rate: number;
  /** Sum of metaShare weights used (only rows with enough personal games). */
  weight: number;
  /** How many archetype rows contributed. */
  rowsUsed: number;
}

/**
 * Weighted average of personal matchup WR by each archetype's meta share.
 * Only rows with ≥ minGames decided matches count.
 */
export function fieldExpectedWr(
  matchups: DeckMatchupRow[],
  rankedDecks: Deck[],
  opts?: { minGames?: number },
): FieldScore | null {
  const minGames = opts?.minGames ?? 3;
  const shareByArch = new Map<string, number>();
  for (const d of rankedDecks) {
    const arch = d.archetype || d.name;
    const share = d.metaShare ?? 0;
    if (share > 0) shareByArch.set(arch, share);
  }

  let weight = 0;
  let sum = 0;
  let rowsUsed = 0;
  for (const r of matchups) {
    const games = r.wins + r.losses;
    if (games < minGames || r.rate == null) continue;
    const w = shareByArch.get(r.archetype) ?? 0;
    if (w <= 0) continue;
    weight += w;
    sum += r.rate * w;
    rowsUsed++;
  }
  if (weight <= 0 || rowsUsed === 0) return null;
  return { rate: sum / weight, weight, rowsUsed };
}
