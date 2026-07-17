/**
 * Arena card id → name + Scryfall identity.
 *
 * Scryfall's /cards/collection endpoint no longer accepts `arena_id` identifiers
 * (returns "Invalid identifier schema"). We resolve via GET /cards/arena/{id}
 * instead, throttled and cached in localStorage so version diffs / My Stats art
 * work offline after first sight.
 */

import { apiFetch } from "./http";

export type ArenaCardInfo = {
  name: string;
  scryfallId?: string;
  /** Full card data (0.19) — older cache entries lack these and re-fetch lazily. */
  typeLine?: string;
  manaCost?: string;
  cmc?: number;
};

const CACHE_KEY = "bbi.arenaCards.v3";
const LEGACY_KEYS = ["bbi.arenaCards.v2", "bbi.arenaCardNames"];
const MAX_CONCURRENT = 4;
const DELAY_MS = 50;

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
    // Migrate older caches (name-only is still useful for offline labels).
    for (const key of LEGACY_KEYS) {
      const legacy = localStorage.getItem(key);
      if (!legacy) continue;
      try {
        const parsed = JSON.parse(legacy) as Record<string, string | ArenaCardInfo>;
        const migrated: Record<number, ArenaCardInfo> = {};
        for (const [k, v] of Object.entries(parsed)) {
          const id = Number(k);
          if (!Number.isFinite(id)) continue;
          if (typeof v === "string" && v) migrated[id] = { name: v };
          else if (v && typeof v === "object" && "name" in v && v.name) {
            migrated[id] = {
              name: v.name,
              scryfallId: (v as ArenaCardInfo).scryfallId,
            };
          }
        }
        memCache = migrated;
        saveCache(migrated);
        return memCache;
      } catch {
        /* try next */
      }
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

type ArenaApiCard = {
  name?: string;
  arena_id?: number;
  id?: string;
  object?: string;
  status?: number;
  type_line?: string;
  mana_cost?: string;
  cmc?: number;
  card_faces?: { type_line?: string; mana_cost?: string }[];
};

async function fetchArenaCard(arenaId: number): Promise<ArenaCardInfo | null> {
  try {
    const res = await apiFetch(`https://api.scryfall.com/cards/arena/${arenaId}`, {
      headers: { Accept: "application/json" },
    });
    if (res.status === 404) {
      notFound.add(arenaId);
      return null;
    }
    if (!res.ok) return null;
    const body = (await res.json()) as ArenaApiCard;
    if (!body?.name) return null;
    const face = body.card_faces?.[0];
    return {
      name: body.name,
      scryfallId: body.id,
      typeLine: body.type_line || face?.type_line || "",
      manaCost: body.mana_cost || face?.mana_cost || "",
      cmc: typeof body.cmc === "number" ? body.cmc : undefined,
    };
  } catch {
    return null;
  }
}

/** Run async work over `items` with a concurrency cap. */
async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
      if (DELAY_MS > 0) await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }
  const n = Math.min(limit, Math.max(1, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

export async function resolveArenaCards(
  ids: number[],
  opts?: {
    /** Require typeLine/cmc — re-fetches pre-0.19 cache entries that lack them. */
    full?: boolean;
  },
): Promise<Record<number, ArenaCardInfo>> {
  const cache = { ...loadCache() };
  const missing = [...new Set(ids)].filter(
    (id) =>
      (cache[id] === undefined || (opts?.full && cache[id].typeLine === undefined)) &&
      !notFound.has(id) &&
      Number.isFinite(id),
  );

  if (missing.length > 0) {
    const results = await mapPool(missing, MAX_CONCURRENT, async (id) => {
      const info = await fetchArenaCard(id);
      return { id, info };
    });
    for (const { id, info } of results) {
      if (info) cache[id] = info;
    }
    saveCache(cache);
  }

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
