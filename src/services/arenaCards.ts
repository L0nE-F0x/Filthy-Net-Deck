/**
 * Arena card id → name + Scryfall identity.
 *
 * Scryfall's /cards/collection endpoint no longer accepts `arena_id` identifiers
 * (returns "Invalid identifier schema"). We resolve via GET /cards/arena/{id}
 * instead, throttled and cached in localStorage so version diffs / My Stats art
 * work offline after first sight.
 */

import { apiFetch } from "./http";
import { loadNameGap } from "./arenaNameGap";

export type ArenaCardInfo = {
  name: string;
  scryfallId?: string;
  /** Full card data (0.19) — older cache entries lack these and re-fetch lazily. */
  typeLine?: string;
  manaCost?: string;
  cmc?: number;
  /**
   * Land-ness straight from Arena's own card table, for gap-map entries that
   * have no `typeLine` to read it from. Group by this first (see `partial`).
   */
  isLand?: boolean;
  /**
   * Filled from the published gap map because Scryfall could not resolve this
   * Arena id (see `arenaNameGap`). There is no Scryfall id, so no art, and no
   * oracle `typeLine` — so a `partial` card groups by `isLand` alone.
   *
   * Never written to the disk cache: once Scryfall assigns the arena_id the
   * real record has to win, and a persisted stub would shadow it forever
   * because a cached hit is not re-fetched.
   */
  partial?: true;
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

/** Soft cap so a multi-season card dictionary cannot grow without bound. */
const MAX_CACHE_ENTRIES = 6_000;

function saveCache(cache: Record<number, ArenaCardInfo>) {
  let next = cache;
  const keys = Object.keys(next);
  if (keys.length > MAX_CACHE_ENTRIES) {
    // Drop the lowest arena ids first (oldest printings) — recent Standard
    // cards sit at higher ids and are more likely to appear again.
    const keep = keys
      .map(Number)
      .filter(Number.isFinite)
      .sort((a, b) => b - a)
      .slice(0, MAX_CACHE_ENTRIES);
    next = {};
    for (const id of keep) next[id] = cache[id];
  }
  memCache = next;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(next));
  } catch {
    /* quota — keep the in-memory copy; next write may succeed after a prune */
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

  // Anything Scryfall still cannot resolve — this call's 404s and ids already in
  // `notFound` from an earlier one — gets a name from the published gap map, so
  // a brand-new set reads as "Smaug the Magnificent" instead of "Card #103489".
  // Merged onto the returned map but deliberately not into the saved cache.
  const unresolved = [...new Set(ids)].filter(
    (id) => Number.isFinite(id) && cache[id] === undefined,
  );
  if (unresolved.length === 0) return cache;

  const gap = await loadNameGap();
  const partials: Record<number, ArenaCardInfo> = {};
  for (const id of unresolved) {
    const card = gap.get(id);
    if (!card) continue;
    partials[id] = {
      name: card.name,
      manaCost: card.manaCost ?? undefined,
      cmc: card.cmc ?? undefined,
      isLand: card.isLand,
      partial: true,
    };
  }
  // A fresh object, because `saveCache` above kept `cache` as the live in-memory
  // cache — writing partials into it would put them in line to be persisted.
  return Object.keys(partials).length ? { ...cache, ...partials } : cache;
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
