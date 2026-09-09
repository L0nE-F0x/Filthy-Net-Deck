/**
 * Pure helpers: match a real tournament 60 onto a Goldfish archetype tile.
 * Used by C3 multi-source list assignment (no invented cards).
 */

export function normalizeCardName(name) {
  const front = String(name || "").split("//")[0] ?? "";
  return front
    .trim()
    .toLowerCase()
    .replace(/['\u2019]/g, "'")
    .replace(/\s+/g, " ");
}

/**
 * Last token of common duals / utility lands. Shared mana bases must not
 * count as archetype evidence — 2026-09-09 a Llanowar Elves pile matched
 * "4c Reanimator" on Formidable Speaker + Superior Spider-Man + five duals.
 */
const LAND_LAST = new Set([
  "plains",
  "island",
  "swamp",
  "mountain",
  "forest",
  "wastes",
  "verge",
  "pathway",
  "fountain",
  "crypt",
  "foundry",
  "garden",
  "tomb",
  "grave",
  "pool",
  "shrine",
  "temple",
  "thicket",
  "courtyard",
  "sanctuary",
  "canal",
  "vantage",
  "marsh",
  "sanctum",
  "sewers",
  "archive",
  "reef",
  "cascade",
  "passage",
  "hamlet",
  "encampment",
  "lair",
  "cottage",
  "field",
  "tunnel",
  "town",
  "citadel",
  "spire",
  "hall",
  "mire",
  "grove",
  "desert",
  "tower",
  "keep",
  "outpost",
  "station",
  "summit",
  "meadow",
  "strand",
  "heath",
  "tarn",
  "catacombs",
  "mesa",
  "flats",
  "foothills",
  "rainforest",
  "vista",
  "wilds",
  "expanse",
  "grotto",
  "vale",
  "quarter",
  "shores",
  "lagoon",
  "delta",
  "ridge",
  "caves",
]);

const LAND_EXACT = new Set([
  "cavern of souls",
  "ba sing se",
  "the lonely mountain",
  "castle doom",
  "boseiju, who endures",
  "otawara, soaring city",
  "eiganjo, seat of the empire",
  "takenuma, abandoned mire",
  "sokenzan, crucible of defiance",
  "minamo, school at water's edge",
  "nykthos, shrine to nyx",
  "plaza of heroes",
  "unclaimed territory",
  "fabled passage",
  "multiversal passage",
  "starting town",
  "demolition field",
  "escape tunnel",
  "petrified hamlet",
  "great hall of the biblioplex",
  "soulstone sanctuary",
  "hidden lair",
  "dalkovan encampment",
]);

/** Best-effort land detector for overlap scoring (no Scryfall at match time). */
export function looksLikeLandName(name) {
  const n = normalizeCardName(name);
  if (!n) return false;
  if (/^(snow-covered )?(plains|island|swamp|mountain|forest|wastes)$/.test(n)) {
    return true;
  }
  if (LAND_EXACT.has(n)) return true;
  const parts = n.split(/[\s,]+/).filter(Boolean);
  const last = parts[parts.length - 1] || "";
  return LAND_LAST.has(last);
}

/** Unique non-land-ish names from a mainboard (best-effort without Scryfall). */
export function distinctiveNames(cards, landNames = null) {
  const out = new Set();
  for (const c of cards || []) {
    const n = normalizeCardName(c.name);
    if (!n) continue;
    if (landNames?.has(n)) continue;
    if (!landNames && looksLikeLandName(n)) continue;
    out.add(n);
  }
  return out;
}

/**
 * Score how well a candidate list fits an archetype tile + optional goldfish list.
 * Higher is better. Returns null when evidence is too thin to claim a match.
 */
export function scoreListForArchetype(candidate, tile, goldfishList = null) {
  const cand = distinctiveNames(candidate.mainboard);
  if (cand.size < 8) return null;

  const keyCards = (tile.keyCards || []).map(normalizeCardName).filter(Boolean);
  let keyHits = 0;
  for (const k of keyCards) {
    if (cand.has(k)) keyHits++;
  }

  let gfHits = 0;
  let gfPool = 0;
  if (goldfishList?.mainboard?.length) {
    const gf = distinctiveNames(goldfishList.mainboard);
    gfPool = gf.size;
    for (const n of cand) {
      if (gf.has(n)) gfHits++;
    }
  }

  // Prefer key-card hits; goldfish overlap is the tie-breaker / primary when keys missing.
  const keyScore = keyCards.length
    ? (keyHits / keyCards.length) * 40 + keyHits * 8
    : 0;
  const overlapScore =
    gfPool > 0 ? (gfHits / Math.max(gfPool, cand.size)) * 50 + gfHits : 0;
  const score = keyScore + overlapScore;

  // Two of three Goldfish tile keys is not an identity. Formidable Speaker +
  // Superior Spider-Man are midrange staples; Bringer of the Last Gift is the
  // 4c Reanimator card. When we have the Goldfish prototype, require real
  // spell overlap (lands are already stripped). Without a prototype, keep the
  // old 2-key gate so a Goldfish outage can still assign from keys alone.
  const allKeys =
    keyCards.length > 0 &&
    keyHits >= Math.min(3, keyCards.length) &&
    keyHits >= 2;
  const ok =
    gfPool > 0
      ? gfHits >= 10 || (allKeys && gfHits >= 5)
      : (keyCards.length > 0 && keyHits >= 2) ||
        (keyCards.length === 0 && gfPool > 0 && gfHits >= 14);

  if (!ok || score < 12) return null;
  return {
    score,
    keyHits,
    keyTotal: keyCards.length,
    gfHits,
    gfPool,
  };
}

/**
 * Pick the best tournament list for a tile from a pool.
 * @returns {{ list: object, match: object } | null}
 */
export function pickBestListForTile(pool, tile, goldfishList = null) {
  let best = null;
  for (const cand of pool || []) {
    const match = scoreListForArchetype(cand, tile, goldfishList);
    if (!match) continue;
    if (!best || match.score > best.match.score) {
      best = { list: cand, match };
    }
  }
  return best;
}
