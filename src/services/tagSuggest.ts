/**
 * B1 accept-tag: pure suggestion of opponent archetype from cards seen.
 * Never invents names — only returns a ranked meta list's archetype.
 */

import type { Deck } from "../types/meta";
import type { TrackedMatch } from "../types/tracker";
import {
  inferOpponentArchetype,
  type InferOptions,
  type NameResolver,
} from "./opponentArchetype";
import { getOpponentNote } from "./matchupNotes";

export interface TagSuggestion {
  opponentName: string;
  archetype: string;
  deckId: string | null;
  confidence: number;
  hits: string[];
}

/**
 * Suggest a tag for the given match when B1 is confident and the opponent
 * is not already tagged.
 */
export function suggestOpponentTag(
  m: TrackedMatch,
  resolveName: NameResolver,
  candidates: Deck[],
  opts?: InferOptions,
): TagSuggestion | null {
  const opponentName = m.opponentName?.trim();
  if (!opponentName) return null;
  const existing = getOpponentNote(opponentName);
  if (existing?.tag?.trim()) return null;
  if (!m.opponentSeen?.length || !candidates.length) return null;

  const guess = inferOpponentArchetype(m.opponentSeen, resolveName, candidates, {
    minHits: opts?.minHits ?? 2,
    minConfidence: opts?.minConfidence ?? 0.45,
  });
  if (!guess) return null;

  return {
    opponentName,
    archetype: guess.archetype,
    deckId: guess.deckId,
    confidence: guess.confidence,
    hits: guess.hits.slice(0, 4),
  };
}
