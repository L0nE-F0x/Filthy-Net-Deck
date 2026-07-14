/**
 * Arena card id → name + Scryfall identity, via Scryfall's collection endpoint
 * (`identifiers: [{ arena_id }]`, max 75 per request). Resolved cards are
 * cached in localStorage so deck version diffs and My Stats art work offline
 * after first sight. Unresolvable ids simply stay absent — callers fall back
 * to "#id" / no art.
 */

export type ArenaCardInfo = {
  name: string;
  scryfallId?: string;
};

const CACHE_KEY = "bbi.arenaCards.v2";
const LEGACY_NAME_KEY = "bbi.arenaCardNames";
const BATCH = 75;

let memCache: Record<number, ArenaCardInfo> | null = null;
/** Ids Scryfall said it does not know — skip re-fetching every session. */
const notFound = new Set<number>();

function loadCache(): Record<number, ArenaCardInfo> {
  if (memCache) return memCache;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      memCache = JSON.parse(raw) as Record<number, ArenaCardInfo>;
      return memCache;
    }
    // One-time migrate v1 name-only cache so offline users keep names.
    const legacy = localStorage.getItem(LEGACY_NAME_KEY);
    if (legacy) {
      const names = JSON.parse(legacy) as Record<string, string>;
      const migrated: Record<number, ArenaCardInfo> = {};
      for (const [k, name] of Object.entries(names)) {
        const id = Number(k);
        if (Number.isFinite(id) && name) migrated[id] = { name };
      }
      memCache = migrated;
      saveCache(migrated);
      return memCache;
    }
  } catch {
    /* ignore */
  }
  memCache = {};
  return memCache;
}

function saveCache(cache: Record<number, ArenaCardInfo>) {
  memCache = cache;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
}

type CollectionCard = {
  name?: string;
  arena_id?: number;
  id?: string;
};

type CollectionResponse = {
  data?: CollectionCard[];
  not_found?: { arena_id?: number }[];
};

export async function resolveArenaCards(
  ids: number[],
): Promise<Record<number, ArenaCardInfo>> {
  const cache = { ...loadCache() };
  const missing = [...new Set(ids)].filter(
    (id) => cache[id] === undefined && !notFound.has(id),
  );

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
          cache[card.arena_id] = {
            name: card.name,
            scryfallId: card.id,
          };
        }
      }
      for (const miss of body.not_found ?? []) {
        if (miss.arena_id != null) notFound.add(miss.arena_id);
      }
    } catch {
      break; // offline — return whatever the cache already has
    }
  }

  if (missing.length > 0) saveCache(cache);
  return cache;
}

/** Back-compat: name map only. */
export async function resolveArenaCardNames(
  ids: number[],
): Promise<Record<number, string>> {
  const cards = await resolveArenaCards(ids);
  const names: Record<number, string> = {};
  for (const [k, v] of Object.entries(cards)) {
    names[Number(k)] = v.name;
  }
  return names;
}
