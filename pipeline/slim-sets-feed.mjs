/**
 * Pure helpers: slim the published sets index and split full galleries out
 * to per-code files. Used by build-sets.mjs and offline transforms.
 */

/** How many cards to keep on the set card rail when the full gallery is lazy. */
export const PREVIEW_RAIL = 12;

/**
 * Statuses that keep full `cards[]` inline in sets.json (active spoiler product).
 * Live/released Standard pool galleries are large (~4MB total) and load on demand.
 */
export function keepFullGalleryInline(status) {
  return status === "spoiling" || status === "announced";
}

/**
 * Split a full sets bundle into a slim index + per-code gallery payloads.
 * @param {object} bundle
 * @returns {{ index: object, galleries: Record<string, { code: string, cards: object[] }> }}
 */
export function splitSetsBundle(bundle) {
  const galleries = {};
  const sets = (bundle.sets || []).map((s) => {
    const cards = Array.isArray(s.cards) ? s.cards : null;
    if (!cards?.length) {
      // Already slim or no gallery — drop redundant previews only when useless.
      if (s.previews?.length && !cards) return s;
      const { previews: _p, ...rest } = s;
      return s.previews?.length ? s : rest;
    }

    if (keepFullGalleryInline(s.status)) {
      // Spoiling: full cards in index; drop previews to avoid duplication.
      if (s.previews) {
        const { previews: _drop, ...rest } = s;
        return rest;
      }
      return s;
    }

    // Live / released: gallery file + short preview rail on the index.
    galleries[s.code] = { code: s.code, cards };
    const previews =
      Array.isArray(s.previews) && s.previews.length
        ? s.previews.slice(0, PREVIEW_RAIL)
        : cards.slice(0, PREVIEW_RAIL);
    const { cards: _drop, ...rest } = s;
    return { ...rest, previews };
  });

  return {
    index: { ...bundle, sets },
    galleries,
  };
}
