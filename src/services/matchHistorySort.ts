/**
 * Match history table sort (peeled from Stats.tsx).
 */

import type { MatchResult, TrackedMatch } from "../types/tracker";
import { queueLabel } from "./tracker";

export type MatchSortKey = "result" | "opponent" | "deck" | "when";
export type SortDir = "asc" | "desc";

export const MATCH_SORT_DEFAULTS: Record<MatchSortKey, SortDir> = {
  result: "asc",
  opponent: "asc",
  deck: "asc",
  when: "desc",
};

const RESULT_ORDER: Record<MatchResult, number> = {
  win: 0,
  draw: 1,
  loss: 2,
  unknown: 3,
};

export function sortMatches(
  matches: TrackedMatch[],
  key: MatchSortKey,
  dir: SortDir,
): TrackedMatch[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...matches].sort((a, b) => {
    let cmp: number;
    if (key === "result") {
      cmp = RESULT_ORDER[a.result] - RESULT_ORDER[b.result];
    } else if (key === "opponent") {
      cmp = (a.opponentName ?? "").localeCompare(b.opponentName ?? "", undefined, {
        sensitivity: "base",
      });
    } else if (key === "deck") {
      cmp = (a.deckName ?? "").localeCompare(b.deckName ?? "", undefined, {
        sensitivity: "base",
      });
      if (cmp === 0) {
        cmp = queueLabel(a.eventId).localeCompare(queueLabel(b.eventId));
      }
    } else {
      cmp = a.endedAt - b.endedAt;
    }
    if (cmp !== 0) return cmp * mul;
    // Stable secondary: newest first
    return b.endedAt - a.endedAt;
  });
}
