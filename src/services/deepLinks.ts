/**
 * Pure deep-link resolution — meta decks, tags, cards.
 * UI/store call these then navigate; never invent decks that aren't on the board.
 */

import type { Deck, FormatId, MetaBundle, PlayMode } from "../types/meta";
import { decksForMode } from "./deckHelpers";
import { buildCardIndex, type CardOccurrence } from "./cardWatch";

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Longest-key-wins fuzzy join (same spirit as personalMeta). Exact match wins. */
export function fuzzyMatchKey(
  query: string,
  candidates: Iterable<string>,
): string | null {
  const q = norm(query);
  if (!q) return null;
  const normalized = [...candidates].map((c) => norm(c)).filter(Boolean);
  if (normalized.includes(q)) return q;
  let best: string | null = null;
  for (const k of normalized) {
    if (!k.includes(q) && !q.includes(k)) continue;
    if (
      best === null ||
      k.length > best.length ||
      (k.length === best.length && k < best)
    ) {
      best = k;
    }
  }
  return best;
}

export interface MetaDeckHit {
  deckId: string;
  deck: Deck;
  formatId: FormatId;
  mode: PlayMode;
}

/** Find a ranked meta deck by archetype/name for a format+mode (defaults bo1). */
export function resolveMetaDeck(
  meta: MetaBundle | null | undefined,
  nameOrArchetype: string,
  opts?: { formatId?: FormatId; mode?: PlayMode },
): MetaDeckHit | null {
  if (!meta || !nameOrArchetype.trim()) return null;
  const mode = opts?.mode ?? "bo1";
  const formats = opts?.formatId
    ? meta.formats.filter((f) => f.id === opts.formatId)
    : meta.formats;

  let best: MetaDeckHit | null = null;
  let bestLen = -1;

  for (const fmt of formats) {
    const decks = decksForMode(fmt, mode, meta.decks);
    for (const deck of decks) {
      const labels = [deck.name, deck.archetype].filter(Boolean) as string[];
      for (const label of labels) {
        const k = norm(label);
        const q = norm(nameOrArchetype);
        if (k === q || k.includes(q) || q.includes(k)) {
          const score = k === q ? 10_000 + k.length : k.length;
          if (score > bestLen) {
            bestLen = score;
            best = { deckId: deck.id, deck, formatId: fmt.id, mode };
          }
        }
      }
    }
  }
  return best;
}

/** Prefer exact archetype match among ranked decks, then fuzzy. */
export function resolveMetaDeckByTag(
  meta: MetaBundle | null | undefined,
  tag: string,
  opts?: { formatId?: FormatId; mode?: PlayMode },
): MetaDeckHit | null {
  return resolveMetaDeck(meta, tag, opts);
}

/** Occurrences of a card in today's meta (for Hub ban rails etc.). */
export function metaOccurrencesForCard(
  meta: MetaBundle | null | undefined,
  cardName: string,
): CardOccurrence[] {
  if (!meta || !cardName.trim()) return [];
  const index = buildCardIndex(meta);
  const key = norm(cardName);
  // exact then fuzzy key among index
  if (index.byName.has(key)) return index.byName.get(key) ?? [];
  for (const [k, occ] of index.byName) {
    if (k.includes(key) || key.includes(k)) return occ;
  }
  return [];
}
