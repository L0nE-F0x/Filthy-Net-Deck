/**
 * Card name → Scryfall identity (type line, mana value) for pasted decklists.
 *
 * Brew Lab's paste-a-list mode has names but no Arena ids, so we resolve via
 * Scryfall's POST /cards/collection with exact-name identifiers (75 per batch,
 * the API cap). Results are cached in localStorage so a re-clinic of the same
 * brew is instant and works offline. Unknown names resolve to null — they are
 * skipped by the clinic, never guessed.
 */

import { apiFetch } from "./http";

export type NamedCardInfo = {
  name: string;
  scryfallId?: string;
  typeLine?: string;
  manaCost?: string;
  cmc?: number;
};

const CACHE_KEY = "bbi.namedCards.v1";
const BATCH = 75;

let memCache: Record<string, NamedCardInfo | null> | null = null;

export function normalizeCardName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function loadCache(): Record<string, NamedCardInfo | null> {
  if (memCache) return memCache;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      memCache = JSON.parse(raw) as Record<string, NamedCardInfo | null>;
      return memCache;
    }
  } catch {
    /* ignore */
  }
  memCache = {};
  return memCache;
}

function saveCache(cache: Record<string, NamedCardInfo | null>) {
  memCache = cache;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
}

type CollectionCard = {
  name?: string;
  id?: string;
  type_line?: string;
  mana_cost?: string;
  cmc?: number;
  card_faces?: { name?: string; type_line?: string; mana_cost?: string }[];
};

type CollectionResponse = {
  data?: CollectionCard[];
  not_found?: { name?: string }[];
};

function toInfo(card: CollectionCard): NamedCardInfo | null {
  if (!card.name) return null;
  const face = card.card_faces?.[0];
  return {
    name: card.name,
    scryfallId: card.id,
    typeLine: card.type_line || face?.type_line || "",
    manaCost: card.mana_cost || face?.mana_cost || "",
    cmc: typeof card.cmc === "number" ? card.cmc : undefined,
  };
}

/**
 * Resolve names to card info, keyed by `normalizeCardName(input)`.
 * A cached `null` means Scryfall doesn't know the name (typo / not a card).
 */
export async function resolveNamedCards(
  names: string[],
): Promise<Record<string, NamedCardInfo | null>> {
  const cache = { ...loadCache() };
  const wanted = [...new Set(names.map(normalizeCardName))].filter((n) => n);
  const missing = wanted.filter((n) => cache[n] === undefined);

  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    try {
      const res = await apiFetch("https://api.scryfall.com/cards/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ identifiers: batch.map((name) => ({ name })) }),
      });
      if (!res.ok) continue;
      const body = (await res.json()) as CollectionResponse;
      const matched = new Set<string>();
      for (const card of body.data ?? []) {
        const info = toInfo(card);
        if (!info) continue;
        // Key by whichever requested name this card answers (full name or
        // front face) so "Fable of the Mirror-Breaker" and split names hit.
        const full = normalizeCardName(info.name);
        const front = normalizeCardName(info.name.split(" // ")[0] ?? info.name);
        for (const n of batch) {
          if (n === full || n === front) {
            cache[n] = info;
            matched.add(n);
          }
        }
      }
      for (const nf of body.not_found ?? []) {
        const n = nf.name ? normalizeCardName(nf.name) : null;
        if (n && !matched.has(n)) cache[n] = null;
      }
      // Anything Scryfall matched under a name-shape we didn't anticipate:
      // leave uncached so a retry can still succeed.
    } catch {
      /* offline — leave uncached for a later retry */
    }
  }

  saveCache(cache);
  const out: Record<string, NamedCardInfo | null> = {};
  for (const n of wanted) out[n] = cache[n] ?? null;
  return out;
}
