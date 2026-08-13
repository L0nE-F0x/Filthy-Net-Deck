/**
 * Names for Arena cards Scryfall cannot resolve yet, published by
 * `pipeline/sources/arena-names.mjs` as `meta/arena-names.json`.
 *
 * There is a window where a set is playable on Arena but Scryfall has not
 * assigned its `arena_id`s. Hit for real on 2026-08-12 with **The Hobbit**:
 * every card showed as `Card #103529`, because `/cards/arena/103529` returned
 * 404 while Scryfall's own entry for that card said
 * `games: ["paper","mtgo","arena"], arena_id: null`.
 *
 * This lives in its own module because the app has **two** Arena id resolvers —
 * `arenaMeta` (overlay, archetype inference) and `arenaCards` (My Stats deck
 * list, My Stats clinic, deck share). v3.0.1/v3.0.2 taught only the first one about the
 * gap map, so My Stats kept showing `Card #103482` after the fix shipped. Both
 * now read the map from here, and neither owns it.
 *
 * Fetched lazily — only after a Scryfall lookup has actually missed — so the
 * overwhelmingly common case (Scryfall knows everything) costs nothing.
 */
import { apiFetch } from "./http";
import { SITE_ORIGINS } from "./site";
import type { ManaColor } from "../types/meta";

const GAP_PATH = "/meta/arena-names.json";

/**
 * Wire shape: n name, c cmc, i colour identity, m mana cost, l land,
 * s Scryfall id, t Scryfall type line.
 */
type GapEntry = {
  n?: unknown;
  c?: unknown;
  i?: unknown;
  m?: unknown;
  l?: unknown;
  s?: unknown;
  t?: unknown;
};

/**
 * What Arena's own card table says about a card Scryfall cannot resolve: name,
 * mana value, colour identity, and whether it is a land.
 *
 * Everything here is keyed by the same `grpId` the log emits, so there is no
 * cross-mapping that could disagree — which is precisely what went wrong in the
 * basic-land bug, where a Swamp in the game object resolved to an Island through
 * the card API.
 *
 * `scryfallId` and `typeLine` come from Scryfall's own record for the card,
 * which exists — the only thing Scryfall is missing is the `arena_id` link. The
 * builder joins the two by name within a single set, so these are looked up,
 * never invented. v3.0.1–v3.0.3 shipped without them on the reasoning that "no
 * Scryfall id means no art"; the id was in the same response that proved the
 * `arena_id` was absent, and discarding it is why the owner saw named cards
 * with blank art and every one of them filed under "Other".
 *
 * What is still absent stays absent. Both fields are `null` when the join
 * missed, an omitted `cmc` stays `null`, and an omitted colour identity stays
 * empty — so "Arena did not say" remains distinguishable from "colourless" and
 * cannot be read as evidence by archetype inference.
 */
export type GapCard = {
  name: string;
  cmc: number | null;
  colorIdentity: ManaColor[];
  manaCost: string | null;
  isLand: boolean;
  /** Scryfall card id for art, or null when the name join missed. */
  scryfallId: string | null;
  /** Scryfall oracle type line, or null when the name join missed. */
  typeLine: string | null;
};

let gapMap: Map<number, GapCard> | null = null;
let gapInflight: Promise<Map<number, GapCard>> | null = null;

export function parseGapEntry(v: unknown): GapCard | null {
  // Tolerates the v3.0.1 shape, which was a bare name string.
  if (typeof v === "string") {
    const name = v.trim();
    return name
      ? {
          name,
          cmc: null,
          colorIdentity: [],
          manaCost: null,
          isLand: false,
          scryfallId: null,
          typeLine: null,
        }
      : null;
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
  const scryfallId = typeof e.s === "string" && e.s.trim() ? e.s.trim() : null;
  const typeLine = typeof e.t === "string" && e.t.trim() ? e.t.trim() : null;
  return {
    name,
    cmc,
    colorIdentity,
    manaCost,
    isLand: e.l === 1 || e.l === true,
    scryfallId,
    typeLine,
  };
}

/** The published gap map, fetched once per session and shared by both resolvers. */
export async function loadNameGap(): Promise<Map<number, GapCard>> {
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

/** Look one id up, loading the map on first miss. */
export async function gapCard(grpId: number): Promise<GapCard | null> {
  return (await loadNameGap()).get(grpId) ?? null;
}
