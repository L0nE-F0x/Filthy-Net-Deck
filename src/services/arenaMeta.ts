/**
 * Arena grpId → display meta (name, land, art) via Scryfall.
 * Persisted in localStorage so rematches don't re-hit the network.
 */
import { apiFetch } from "./http";
import { scryfallCdnUrl } from "./scryfall";
import { SITE_ORIGINS } from "./site";
import type { ManaColor } from "../types/meta";

/**
 * Names for Arena cards Scryfall cannot resolve yet, published by
 * `pipeline/sources/arena-names.mjs`.
 *
 * There is a window where a set is playable on Arena but Scryfall has not
 * assigned its `arena_id`s. Hit for real on 2026-08-12 with **The Hobbit**:
 * every card showed as `Card #103529` in the deck list and the overlay, because
 * `/cards/arena/103529` returned 404 while Scryfall's own entry for that card
 * said `games: ["paper","mtgo","arena"], arena_id: null`.
 *
 * This is a **name-only** fallback. It deliberately does not synthesise a full
 * `ArenaCardMeta`: no Scryfall id means no art and no reliable colour identity,
 * and inventing those would feed archetype inference values it cannot stand
 * behind. A name is the honest maximum, and it is what the deck list and
 * overlay actually need.
 *
 * Fetched lazily — only after a Scryfall lookup has actually missed — so the
 * overwhelmingly common case (Scryfall knows everything) costs nothing.
 */
const GAP_PATH = "/meta/arena-names.json";

/** Wire shape: n name, c cmc, i colour identity, m mana cost, l land. */
type GapEntry = { n?: unknown; c?: unknown; i?: unknown; m?: unknown; l?: unknown };
type GapCard = {
  name: string;
  cmc: number | null;
  colorIdentity: ManaColor[];
  manaCost: string | null;
  isLand: boolean;
};

let gapMap: Map<number, GapCard> | null = null;
let gapInflight: Promise<Map<number, GapCard>> | null = null;

function parseGapEntry(v: unknown): GapCard | null {
  // Tolerates the v3.0.1 shape, which was a bare name string.
  if (typeof v === "string") {
    const name = v.trim();
    return name ? { name, cmc: null, colorIdentity: [], manaCost: null, isLand: false } : null;
  }
  if (!v || typeof v !== "object") return null;
  const e = v as GapEntry;
  const name = typeof e.n === "string" ? e.n.trim() : "";
  if (!name) return null;
  const cmc = typeof e.c === "number" && Number.isFinite(e.c) ? e.c : null;
  const colorIdentity =
    typeof e.i === "string"
      ? ([...e.i].filter((c): c is ManaColor => /^[WUBRG]$/.test(c)) as ManaColor[])
      : [];
  const manaCost = typeof e.m === "string" && e.m.trim() ? e.m.trim() : null;
  return { name, cmc, colorIdentity, manaCost, isLand: e.l === 1 || e.l === true };
}

async function loadNameGap(): Promise<Map<number, GapCard>> {
  if (gapMap) return gapMap;
  if (gapInflight) return gapInflight;
  gapInflight = (async () => {
    for (const origin of SITE_ORIGINS) {
      try {
        const res = await apiFetch(`${origin}${GAP_PATH}`, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) continue;
        const raw = (await res.json()) as Record<string, unknown>;
        const m = new Map<number, GapCard>();
        for (const [k, v] of Object.entries(raw ?? {})) {
          const id = Number(k);
          const card = parseGapEntry(v);
          if (Number.isFinite(id) && card) m.set(id, card);
        }
        gapMap = m;
        return m;
      } catch {
        /* try the legacy origin, then give up */
      }
    }
    // Empty map, cached: one failed attempt per session, not one per card.
    gapMap = new Map();
    return gapMap;
  })();
  return gapInflight;
}

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
 * What Arena itself says about a card Scryfall cannot resolve: name, mana
 * value, colour identity, and whether it is a land.
 *
 * Everything here comes from Arena's own card table keyed by the same `grpId`
 * the log emits, so there is no cross-mapping that could disagree — which is
 * precisely what went wrong in the basic-land bug, where a Swamp in the game
 * object resolved to an Island through the card API.
 *
 * What is still absent stays absent: no `scryfallId` means no art, and
 * `typeLine` and `manaCost` are left empty rather than reconstructed. An
 * omitted `cmc` stays `null` and an omitted colour identity stays empty, so
 * "Arena did not say" remains distinguishable from "colourless" and cannot be
 * read as evidence.
 */
async function nameOnlyFallback(grpId: number): Promise<ArenaCardMeta | null> {
  const card = (await loadNameGap()).get(grpId);
  if (!card) return null;
  return {
    name: card.name,
    typeLine: "",
    isLand: card.isLand,
    scryfallId: "",
    artUrl: null,
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
