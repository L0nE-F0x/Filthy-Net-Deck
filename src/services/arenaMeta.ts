/**
 * Arena grpId → display meta (name, land, art) via Scryfall.
 * Persisted in localStorage so rematches don't re-hit the network.
 */
import { apiFetch } from "./http";
import { scryfallCdnUrl } from "./scryfall";

export type ArenaCardMeta = {
  name: string;
  typeLine: string;
  isLand: boolean;
  scryfallId: string;
  /** Small face art CDN URL (or null if unknown). */
  artUrl: string | null;
  /** Converted mana cost (null when Scryfall has none, e.g. some tokens). */
  cmc: number | null;
  /** Front-face mana cost string, e.g. "{2}{U}{U}" (null when unknown). */
  manaCost: string | null;
};

/** v2: adds cmc + manaCost for overlay grouping / mana pips. */
const LS_KEY = "bbi.arenaMeta.v2";
const mem = new Map<number, ArenaCardMeta | null>();
const inflight = new Map<number, Promise<ArenaCardMeta | null>>();

function loadDisk(): void {
  if (mem.size) return;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw) as Record<string, ArenaCardMeta | null>;
    for (const [k, v] of Object.entries(obj)) {
      const id = Number(k);
      // Skip nulls (failed/absent lookups) so they retry this session rather
      // than staying poisoned. Tolerates older blobs that persisted nulls.
      if (Number.isFinite(id) && v) mem.set(id, v);
    }
  } catch {
    /* ignore */
  }
}

let persistTimer: number | undefined;
function schedulePersist(): void {
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    try {
      const obj: Record<string, ArenaCardMeta> = {};
      // Cap cache size so localStorage stays small.
      let n = 0;
      for (const [id, meta] of mem) {
        // Persist only successful resolves. A null is a failed/absent lookup
        // (often a transient offline hit at match start) — keep it in memory
        // for this session, never on disk, so the next session retries instead
        // of showing "Card {grpId}" until a cache-key bump.
        if (!meta) continue;
        if (n++ > 4000) break;
        obj[String(id)] = meta;
      }
      localStorage.setItem(LS_KEY, JSON.stringify(obj));
    } catch {
      /* quota */
    }
  }, 800);
}

type ScryfallArenaCard = {
  id?: string;
  name?: string;
  type_line?: string;
  mana_cost?: string;
  cmc?: number;
  card_faces?: {
    name?: string;
    type_line?: string;
    mana_cost?: string;
    image_uris?: Record<string, string>;
  }[];
  image_uris?: Record<string, string>;
};

function isLandType(typeLine: string): boolean {
  // "Legendary Land — …", "Basic Land — Island", "Artifact Land", etc.
  return /(?:^| )\bLand\b/.test(typeLine);
}

function fromScryfall(data: ScryfallArenaCard): ArenaCardMeta | null {
  const name =
    data.name?.trim() || data.card_faces?.[0]?.name?.trim() || "";
  if (!name) return null;
  const typeLine =
    data.type_line?.trim() ||
    data.card_faces?.[0]?.type_line?.trim() ||
    "";
  const scryfallId = data.id?.trim() || "";
  const artUrl = scryfallId ? scryfallCdnUrl(scryfallId, "art_crop") : null;
  const cmc = typeof data.cmc === "number" && Number.isFinite(data.cmc) ? data.cmc : null;
  const manaCost =
    data.mana_cost?.trim() || data.card_faces?.[0]?.mana_cost?.trim() || null;
  return {
    name,
    typeLine,
    isLand: isLandType(typeLine),
    scryfallId,
    artUrl,
    cmc,
    manaCost,
  };
}

export function peekArenaMeta(grpId: number): ArenaCardMeta | null | undefined {
  loadDisk();
  return mem.has(grpId) ? mem.get(grpId) : undefined;
}

export async function resolveArenaMeta(
  grpId: number,
): Promise<ArenaCardMeta | null> {
  loadDisk();
  if (mem.has(grpId)) return mem.get(grpId) ?? null;
  const existing = inflight.get(grpId);
  if (existing) return existing;

  const p = (async () => {
    try {
      const res = await apiFetch(
        `https://api.scryfall.com/cards/arena/${grpId}`,
        { headers: { Accept: "application/json" } },
      );
      if (!res.ok) {
        mem.set(grpId, null);
        schedulePersist();
        return null;
      }
      const data = (await res.json()) as ScryfallArenaCard;
      const meta = fromScryfall(data);
      mem.set(grpId, meta);
      schedulePersist();
      return meta;
    } catch {
      // Session-only negative cache: null avoids re-hitting this id now, but
      // schedulePersist() never writes nulls, so the next session retries.
      mem.set(grpId, null);
      schedulePersist();
      return null;
    } finally {
      inflight.delete(grpId);
    }
  })();

  inflight.set(grpId, p);
  return p;
}

/** Resolve many ids with low concurrency (Scryfall-friendly). */
export async function resolveArenaMetaBatch(
  ids: number[],
  concurrency = 2,
): Promise<void> {
  loadDisk();
  const missing = ids.filter((id) => peekArenaMeta(id) === undefined);
  if (!missing.length) return;
  let i = 0;
  async function worker() {
    while (i < missing.length) {
      const id = missing[i++];
      await resolveArenaMeta(id);
      // ~100ms between calls per worker keeps us under Scryfall guidance.
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, missing.length) }, () =>
      worker(),
    ),
  );
}
