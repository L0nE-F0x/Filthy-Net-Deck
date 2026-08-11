/**
 * Deck list version history helpers (peeled from Stats.tsx).
 * A "version" is a distinct deckHash with its chronological match group.
 */

import type { TrackedMatch } from "../types/tracker";

export interface DeckVersion {
  hash: string;
  main?: number[];
  side?: number[];
  matches: TrackedMatch[];
  firstAt: number;
  lastAt: number;
  /** True when the list came from the cloud backup, not from local history. */
  fromCloud?: boolean;
}

/** A backed-up list, keyed by deckHash (`services/cloud/deckSync`). */
export interface RestoredList {
  main: number[];
  side?: number[];
}

/**
 * Versions in order of first appearance; a version = a distinct card list.
 *
 * `restored` fills versions whose list is missing locally. Only game 1 of a
 * match registers a list, and history is re-derived from Arena's logs each
 * launch — so once the logs rotate, a deck the user still has matches for can
 * lose the 75 cards it was. Cloud backup is exactly the gap this closes, and a
 * local list always wins: it came from the log itself.
 */
export function buildVersions(
  deckMatches: TrackedMatch[],
  restored?: ReadonlyMap<string, RestoredList> | null,
): DeckVersion[] {
  const asc = [...deckMatches].sort((a, b) => a.startedAt - b.startedAt);
  const byHash = new Map<string, DeckVersion>();
  for (const m of asc) {
    if (!m.deckHash) continue;
    let v = byHash.get(m.deckHash);
    if (!v) {
      v = {
        hash: m.deckHash,
        matches: [],
        firstAt: m.startedAt,
        lastAt: m.endedAt,
      };
      byHash.set(m.deckHash, v);
    }
    v.matches.push(m);
    v.lastAt = Math.max(v.lastAt, m.endedAt);
    if (!v.main && m.deckMain) {
      v.main = m.deckMain;
      v.side = m.deckSide;
      v.fromCloud = false;
    }
  }
  if (restored?.size) {
    for (const v of byHash.values()) {
      if (v.main) continue;
      const list = restored.get(v.hash);
      if (!list?.main.length) continue;
      v.main = list.main;
      v.side = list.side;
      v.fromCloud = true;
    }
  }
  return [...byHash.values()];
}

/** Multiset diff: positive delta = added in `next`, negative = cut. */
export function diffLists(
  prev: number[],
  next: number[],
): { id: number; delta: number }[] {
  const counts = new Map<number, number>();
  for (const id of next) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const id of prev) counts.set(id, (counts.get(id) ?? 0) - 1);
  return [...counts.entries()]
    .filter(([, delta]) => delta !== 0)
    .map(([id, delta]) => ({ id, delta }))
    .sort((a, b) => b.delta - a.delta || a.id - b.id);
}

/** Latest stored mainboard for a deck group (newest match with a list wins). */
export function latestMainboard(matches: TrackedMatch[]): number[] | undefined {
  for (const m of matches) {
    if (m.deckMain?.length) return m.deckMain;
  }
  return undefined;
}

/** Latest stored full list (main + side) for a deck group. */
export function latestDecklist(
  matches: TrackedMatch[],
): { main: number[]; side?: number[] } | undefined {
  for (const m of matches) {
    if (m.deckMain?.length) return { main: m.deckMain, side: m.deckSide };
  }
  return undefined;
}
