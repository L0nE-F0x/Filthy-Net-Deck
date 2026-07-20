/**
 * Deck arsenal aggregation for My Stats — pure grouping/sorting over tracker
 * matches (peeled from Stats.tsx).
 */

import type { TrackedMatch } from "../types/tracker";
import { deckKey } from "./tracker";
import { tallyMatches } from "./statsHelpers";
import type { DeckRuns } from "./deckRuns";

export interface DeckGroup {
  key: string;
  name: string;
  matches: TrackedMatch[];
  runActive: boolean;
  /** Newest match end time (ms) on this deck. */
  lastPlayedAt: number;
  /** Oldest match end time (ms) on this deck. */
  firstPlayedAt: number;
}

/** Group matches by deck (newest deckName wins as the display name). Unsorted. */
export function groupDecks(matches: TrackedMatch[], runs: DeckRuns): DeckGroup[] {
  const byKey = new Map<string, DeckGroup>();
  for (const m of matches) {
    const key = deckKey(m);
    let g = byKey.get(key);
    if (!g) {
      g = {
        key,
        name: "",
        matches: [],
        runActive: runs[key] !== undefined,
        lastPlayedAt: m.endedAt,
        firstPlayedAt: m.endedAt,
      };
      byKey.set(key, g);
    }
    g.matches.push(m);
    if (m.endedAt > g.lastPlayedAt) g.lastPlayedAt = m.endedAt;
    if (m.endedAt < g.firstPlayedAt) g.firstPlayedAt = m.endedAt;
    // trackerMatches is newest-first, so keep the first name we see.
    if (!g.name && m.deckName) g.name = m.deckName;
  }
  for (const g of byKey.values()) {
    if (!g.name) g.name = "Unknown deck";
  }
  return [...byKey.values()];
}

export type DeckSortKey = "name" | "matches" | "rate" | "last" | "first";
export type SortDir = "asc" | "desc";

export const DECK_SORT_DEFAULTS: Record<DeckSortKey, SortDir> = {
  name: "asc",
  matches: "desc",
  rate: "desc",
  last: "desc",
  first: "asc",
};

export function sortDecks(
  decks: DeckGroup[],
  key: DeckSortKey,
  dir: SortDir,
): DeckGroup[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...decks].sort((a, b) => {
    if (key === "name") {
      const cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      return cmp !== 0 ? cmp * mul : b.lastPlayedAt - a.lastPlayedAt;
    }
    if (key === "matches") {
      const cmp = a.matches.length - b.matches.length;
      return cmp !== 0 ? cmp * mul : b.lastPlayedAt - a.lastPlayedAt;
    }
    if (key === "last") {
      const cmp = a.lastPlayedAt - b.lastPlayedAt;
      return cmp !== 0 ? cmp * mul : b.matches.length - a.matches.length;
    }
    if (key === "first") {
      const cmp = a.firstPlayedAt - b.firstPlayedAt;
      return cmp !== 0 ? cmp * mul : b.matches.length - a.matches.length;
    }
    // rate — nulls always last
    const ra = tallyMatches(a.matches).rate;
    const rb = tallyMatches(b.matches).rate;
    if (ra == null && rb == null) return b.lastPlayedAt - a.lastPlayedAt;
    if (ra == null) return 1;
    if (rb == null) return -1;
    const cmp = ra - rb;
    return cmp !== 0 ? cmp * mul : b.lastPlayedAt - a.lastPlayedAt;
  });
}
