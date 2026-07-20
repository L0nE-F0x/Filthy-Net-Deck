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

/** Unique non-land-ish names from a mainboard (best-effort without Scryfall). */
export function distinctiveNames(cards, landNames = null) {
  const out = new Set();
  for (const c of cards || []) {
    const n = normalizeCardName(c.name);
    if (!n) continue;
    if (landNames?.has(n)) continue;
    // Cheap basic/landish filter when we don't have land flags yet
    if (
      !landNames &&
      /^(plains|island|swamp|mountain|forest|wastes|snow-covered )\b/.test(n)
    ) {
      continue;
    }
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

  // Gates: need either 2+ key hits, or strong list overlap (12+ shared non-basics).
  const ok =
    (keyCards.length > 0 && keyHits >= 2) ||
    (gfPool > 0 && gfHits >= 12) ||
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
