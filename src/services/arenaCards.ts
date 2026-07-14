/**
 * Arena card id → card name, via Scryfall's collection endpoint
 * (`identifiers: [{ arena_id }]`, max 75 per request). Resolved names are
 * cached in localStorage so deck version diffs work offline after first sight.
 * Unresolvable ids simply stay absent — callers fall back to "#id".
 */

const CACHE_KEY = "bbi.arenaCardNames";
const BATCH = 75;

let memCache: Record<number, string> | null = null;

function loadCache(): Record<number, string> {
  if (memCache) return memCache;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    memCache = raw ? (JSON.parse(raw) as Record<number, string>) : {};
  } catch {
    memCache = {};
  }
  return memCache;
}

function saveCache(cache: Record<number, string>) {
  memCache = cache;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
}

type CollectionResponse = {
  data?: { name?: string; arena_id?: number }[];
};

export async function resolveArenaCardNames(
  ids: number[],
): Promise<Record<number, string>> {
  const cache = { ...loadCache() };
  const missing = [...new Set(ids)].filter((id) => cache[id] === undefined);

  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    try {
      const res = await fetch("https://api.scryfall.com/cards/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          identifiers: batch.map((arena_id) => ({ arena_id })),
        }),
      });
      if (!res.ok) break;
      const body = (await res.json()) as CollectionResponse;
      for (const card of body.data ?? []) {
        if (card.arena_id != null && card.name) {
          cache[card.arena_id] = card.name;
        }
      }
    } catch {
      break; // offline — return whatever the cache already has
    }
  }

  if (missing.length > 0) saveCache(cache);
  return cache;
}
