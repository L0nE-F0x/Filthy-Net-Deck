/**
 * Arena grpId → display meta (name, land, art) via Scryfall.
 * Persisted in localStorage so rematches don't re-hit the network.
 */
import { apiFetch } from "./http";
import { scryfallCdnUrl } from "./scryfall";
import { gapCard } from "./arenaNameGap";
import type { ManaColor } from "../types/meta";

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
  /** Scryfall color identity, e.g. ["W","B"]. Lands included (what they tap for).
   *  Optional: entries cached before v3 have none. */
  colorIdentity?: ManaColor[];
  /**
   * Name-only entry from the gap map — Scryfall could not resolve this Arena id
   * (see `nameOnlyFallback`). Everything except `name` is absent rather than
   * known, so these are **never written to disk**: once Scryfall assigns the
   * arena_id the real record should win, and a persisted stub would shadow it
   * forever because `resolveArenaMeta` short-circuits on any cached hit.
   */
  partial?: true;
};

/**
 * v3: adds colorIdentity so archetype inference can tell that an opponent
 * casting {B} spells / playing black lands is not on a mono-white list.
 */
const LS_KEY = "bbi.arenaMeta.v3";
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
        // Persist only complete, successful resolves. A null is a failed/absent
        // lookup (often a transient offline hit at match start) and a `partial`
        // is a name-only gap-map entry — both stay in memory for this session
        // and never on disk, so the next session retries Scryfall instead of
        // being stuck with "Card {grpId}" or a stub until a cache-key bump.
        if (!meta || meta.partial) continue;
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
  color_identity?: string[];
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
  const colorIdentity = (data.color_identity ?? [])
    .map((c) => c.trim().toUpperCase())
    .filter((c): c is ManaColor => /^[WUBRG]$/.test(c));
  return {
    name,
    typeLine,
    isLand: isLandType(typeLine),
    scryfallId,
    artUrl,
    cmc,
    manaCost,
    colorIdentity,
  };
}

/**
 * What Arena itself says about a card Scryfall cannot resolve (see
 * `arenaNameGap`), shaped as an `ArenaCardMeta`.
 *
 * The gap map now carries Scryfall's own id and type line for these cards when
 * the builder could join them by name — Scryfall has the card, it is only the
 * `arena_id` link that is missing — so art and the oracle type line come
 * through. What the join could not supply stays absent: `typeLine` falls back
 * to empty and `artUrl` to null rather than being reconstructed.
 *
 * `isLand` still prefers Arena's own flag. Arena's card table is authoritative
 * about the id the log actually emitted, and it is populated even when the name
 * join misses.
 */
async function nameOnlyFallback(grpId: number): Promise<ArenaCardMeta | null> {
  const card = await gapCard(grpId);
  if (!card) return null;
  const scryfallId = card.scryfallId ?? "";
  return {
    name: card.name,
    typeLine: card.typeLine ?? "",
    isLand: card.isLand || (card.typeLine ? isLandType(card.typeLine) : false),
    scryfallId,
    artUrl: scryfallId ? scryfallCdnUrl(scryfallId, "art_crop") : null,
    cmc: card.cmc,
    manaCost: card.manaCost,
    colorIdentity: card.colorIdentity,
    partial: true,
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
        // Scryfall does not know this Arena id. Before giving up, check the
        // published gap map — a set that is live on Arena but whose arena_ids
        // Scryfall has not assigned lands here, and a name is much better than
        // "Card #103529".
        const fallback = await nameOnlyFallback(grpId);
        mem.set(grpId, fallback);
        schedulePersist();
        return fallback;
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

/**
 * Resolver for archetype inference: name plus the color evidence (mana cost,
 * type line, color identity) so a mono-colored guess can be corrected when the
 * opponent has demonstrably cast off-color spells or played off-color lands.
 * Cache-only — call `resolveArenaMetaBatch` first to warm it.
 */
export function peekSeenCard(grpId: number): {
  name: string;
  manaCost: string | null;
  typeLine: string;
  isLand: boolean;
  colorIdentity: ManaColor[];
} | null {
  const m = peekArenaMeta(grpId);
  if (!m?.name) return null;
  return {
    name: m.name,
    manaCost: m.manaCost ?? null,
    typeLine: m.typeLine ?? "",
    isLand: m.isLand,
    colorIdentity: m.colorIdentity ?? [],
  };
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
