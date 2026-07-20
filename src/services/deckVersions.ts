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
}

/** Versions in order of first appearance; a version = a distinct card list. */
export function buildVersions(deckMatches: TrackedMatch[]): DeckVersion[] {
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
