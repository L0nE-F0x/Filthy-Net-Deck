import type { CardEntry, FormatId, MetaBundle, PlayMode } from "../types/meta";
import { decksForMode } from "./deckHelpers";

/** One appearance of a card in a meta decklist. A deck listed for both Bo1 and Bo3 produces one occurrence per mode. */
export interface CardOccurrence {
  cardName: string;
  formatId: FormatId;
  formatName: string;
  mode: PlayMode;
  deckId: string;
  deckName: string;
  rank?: number;
  tier: 1 | 2 | 3;
  board: "main" | "side";
  count: number;
  metaShare?: number;
}

/** Normalized card name → every occurrence across today's meta. */
export interface CardIndex {
  byName: Map<string, CardOccurrence[]>;
}

export interface CardSearchResult {
  name: string;
  occurrences: CardOccurrence[];
}

export interface DeckSearchResult {
  deckId: string;
  deckName: string;
  formatId: FormatId;
  formatName: string;
  mode: PlayMode;
  rank?: number;
  tier: 1 | 2 | 3;
}

const MODES: PlayMode[] = ["bo1", "bo3"];

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** 0 = exact, 1 = prefix, 2 = substring, undefined = no match. */
function matchScore(candidate: string, q: string): number | undefined {
  const c = norm(candidate);
  if (!c) return undefined;
  if (c === q) return 0;
  if (c.startsWith(q)) return 1;
  if (c.includes(q)) return 2;
  return undefined;
}

function compareOccurrences(a: CardOccurrence, b: CardOccurrence): number {
  return (
    a.formatId.localeCompare(b.formatId) ||
    a.mode.localeCompare(b.mode) ||
    (a.rank ?? 99) - (b.rank ?? 99)
  );
}

/** Walk every format × mode and index each mainboard + sideboard entry. */
export function buildCardIndex(meta: MetaBundle): CardIndex {
  const byName = new Map<string, CardOccurrence[]>();
  for (const fmt of meta.formats) {
    for (const mode of MODES) {
      decksForMode(fmt, mode, meta.decks).forEach((deck, pos) => {
        const base = {
          formatId: fmt.id,
          formatName: fmt.name,
          mode,
          deckId: deck.id,
          deckName: deck.name,
          rank: deck.rank ?? pos + 1,
          tier: deck.tier,
          metaShare: deck.metaShare,
        };
        const boards: { board: "main" | "side"; entries: CardEntry[] }[] = [
          { board: "main", entries: deck.mainboard },
          { board: "side", entries: deck.sideboard },
        ];
        for (const { board, entries } of boards) {
          for (const entry of entries) {
            const key = norm(entry.name);
            if (!key) continue;
            const occurrence: CardOccurrence = {
              ...base,
              cardName: entry.name,
              board,
              count: entry.count,
            };
            const list = byName.get(key);
            if (list) list.push(occurrence);
            else byName.set(key, [occurrence]);
          }
        }
      });
    }
  }
  // Stable sort: for equal format/mode/rank, mainboard stays before sideboard.
  for (const list of byName.values()) list.sort(compareOccurrences);
  return { byName };
}

/** Exact matches first, then prefix, then substring (alphabetical within each tier). */
export function searchCards(
  index: CardIndex,
  query: string,
  limit = 8,
): CardSearchResult[] {
  const q = norm(query);
  if (!q) return [];
  const exact: string[] = [];
  const prefix: string[] = [];
  const substring: string[] = [];
  for (const key of index.byName.keys()) {
    if (key === q) exact.push(key);
    else if (key.startsWith(q)) prefix.push(key);
    else if (key.includes(q)) substring.push(key);
  }
  prefix.sort();
  substring.sort();
  return [...exact, ...prefix, ...substring]
    .slice(0, limit)
    .map((key) => {
      const occurrences = index.byName.get(key) ?? [];
      return { name: occurrences[0]?.cardName ?? key, occurrences };
    });
}

/** Deck name / archetype matches, one result per format × mode listing. */
export function searchDecks(
  meta: MetaBundle,
  query: string,
  limit = 8,
): DeckSearchResult[] {
  const q = norm(query);
  if (!q) return [];
  const scored: { result: DeckSearchResult; score: number }[] = [];
  for (const fmt of meta.formats) {
    for (const mode of MODES) {
      decksForMode(fmt, mode, meta.decks).forEach((deck, pos) => {
        const score = Math.min(
          matchScore(deck.name, q) ?? 3,
          matchScore(deck.archetype, q) ?? 3,
        );
        if (score === 3) return;
        scored.push({
          score,
          result: {
            deckId: deck.id,
            deckName: deck.name,
            formatId: fmt.id,
            formatName: fmt.name,
            mode,
            rank: deck.rank ?? pos + 1,
            tier: deck.tier,
          },
        });
      });
    }
  }
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      a.result.deckName.localeCompare(b.result.deckName) ||
      a.result.formatId.localeCompare(b.result.formatId) ||
      a.result.mode.localeCompare(b.result.mode),
  );
  return scored.slice(0, limit).map((s) => s.result);
}
