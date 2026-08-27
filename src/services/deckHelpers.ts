import type { Deck, FormatMeta, MetaBundle, PlayMode } from "../types/meta";
import { sanitizeDeckDescription } from "./sanitizeSources";

/** Resolve the ranked board deck ids for a format + mode (supports legacy single-deck feeds). */
export function deckIdsForMode(fmt: FormatMeta, mode: PlayMode): string[] {
  if (mode === "bo1") {
    if (fmt.bo1DeckIds?.length) return fmt.bo1DeckIds.slice(0, 8);
    if (fmt.bo1?.deckId) return [fmt.bo1.deckId];
  } else {
    if (fmt.bo3DeckIds?.length) return fmt.bo3DeckIds.slice(0, 8);
    if (fmt.bo3?.deckId) return [fmt.bo3.deckId];
  }
  return [];
}

export function decksForMode(
  fmt: FormatMeta,
  mode: PlayMode,
  decks: Record<string, Deck>,
): Deck[] {
  return deckIdsForMode(fmt, mode)
    .map((id) => decks[id])
    .filter((d): d is Deck => Boolean(d));
}

/**
 * Every deck of a format: the ranked Bo1+Bo3 boards first (ranked order),
 * then any off-meta recognition decks in the bundle. Deduped by deck id.
 * Use this for anything that should recognize the full archetype universe
 * (search, deep links, card index) rather than just the 8-deck boards.
 */
export function allDecksForFormat(
  fmt: FormatMeta,
  decks: Record<string, Deck>,
): Deck[] {
  const out: Deck[] = [];
  const seen = new Set<string>();
  const push = (d: Deck | undefined) => {
    if (!d || seen.has(d.id)) return;
    seen.add(d.id);
    out.push(d);
  };
  for (const d of decksForMode(fmt, "bo1", decks)) push(d);
  for (const d of decksForMode(fmt, "bo3", decks)) push(d);
  for (const d of Object.values(decks)) {
    if (d.format === fmt.id) push(d);
  }
  return out;
}

/*
 * `formatIdForEvent` was here. It answered "which of the two formats this app
 * covers should I show for this queue?" and returned null for everything else —
 * correct for picking a tier list, and its doc comment said so.
 *
 * The trouble was the shape. Returning null for Standard *and* for Historic
 * made `formatIdForEvent(id) ?? "standard"` the obvious way to call it, and
 * every caller wrote exactly that. Which is how a Historic game came to be
 * counted in the Standard matchup table, and how the overlay came to name a
 * Standard archetype during a Historic match.
 *
 * Every caller now uses `services/arenaFormat`, which distinguishes the three
 * cases the old signature could not: `metaFormatOf` for anything joining crowd
 * data, `localFormatOf` for a local page scoped to one format. That left this
 * with no callers, and a dead export whose natural call site is a bug is worth
 * deleting rather than keeping for symmetry.
 */

/**
 * Candidate pool for opponent-archetype inference.
 *
 * Prefer the mode that matches the queue (Bo1 vs Bo3 lists can differ), then
 * fold in the other mode's board and every off-meta recognition deck of the
 * same format, so near-twins like Jeskai Lessons / Izzet Lessons / 4c Control
 * AND off-meta decks beyond the boards all stay in the field. Dedupes by deck
 * id. When no format is known, falls back to every deck in the bundle.
 */
export function inferenceCandidates(
  decks: Record<string, Deck>,
  opts?: {
    format?: FormatMeta | null;
    mode?: PlayMode | null;
    /** When true (default), include the other mode's 8 as well. */
    bothModes?: boolean;
  },
): Deck[] {
  const fmt = opts?.format;
  const mode = opts?.mode ?? "bo1";
  const bothModes = opts?.bothModes !== false;
  const out: Deck[] = [];
  const seen = new Set<string>();
  const push = (d: Deck | undefined) => {
    if (!d || seen.has(d.id)) return;
    seen.add(d.id);
    out.push(d);
  };

  if (fmt) {
    for (const d of decksForMode(fmt, mode, decks)) push(d);
    if (bothModes) {
      const other: PlayMode = mode === "bo1" ? "bo3" : "bo1";
      for (const d of decksForMode(fmt, other, decks)) push(d);
    }
    // Any other list of the same format not already on the 8×8 grid.
    for (const d of Object.values(decks)) {
      if (d.format === fmt.id) push(d);
    }
    return out;
  }

  for (const d of Object.values(decks)) push(d);
  return out;
}

/**
 * Build the inference field across every format in a meta bundle (used by
 * match-history / analytics where the queue format is unknown).
 */
export function inferenceCandidatesFromBundle(
  bundle: { formats: FormatMeta[]; decks: Record<string, Deck> } | null | undefined,
  mode?: PlayMode | null,
): Deck[] {
  if (!bundle?.decks) return [];
  const out: Deck[] = [];
  const seen = new Set<string>();
  for (const fmt of bundle.formats ?? []) {
    for (const d of inferenceCandidates(bundle.decks, { format: fmt, mode })) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      out.push(d);
    }
  }
  if (!out.length) {
    for (const d of Object.values(bundle.decks)) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      out.push(d);
    }
  }
  return out;
}

export function topDeckForMode(
  fmt: FormatMeta,
  mode: PlayMode,
  decks: Record<string, Deck>,
): Deck | undefined {
  return decksForMode(fmt, mode, decks)[0];
}

export function normalizeMetaBundle(bundle: MetaBundle): MetaBundle {
  const formats = bundle.formats.map((fmt) => {
    const bo1DeckIds =
      fmt.bo1DeckIds?.length
        ? fmt.bo1DeckIds
        : fmt.bo1?.deckId
          ? [fmt.bo1.deckId]
          : [];
    const bo3DeckIds =
      fmt.bo3DeckIds?.length
        ? fmt.bo3DeckIds
        : fmt.bo3?.deckId
          ? [fmt.bo3.deckId]
          : [];
    return {
      ...fmt,
      bo1DeckIds,
      bo3DeckIds,
      bo1: { deckId: bo1DeckIds[0] ?? "" },
      bo3: { deckId: bo3DeckIds[0] ?? "" },
    };
  });
  // Hide data-source provenance app-wide (kept only on the Events page):
  // sanitize each deck's description, and drop the listNote / sources fields
  // that exist purely to state where a list came from.
  const decks: Record<string, Deck> = {};
  for (const [id, deck] of Object.entries(bundle.decks ?? {})) {
    decks[id] = {
      ...deck,
      description: sanitizeDeckDescription(deck.description),
      listNote: undefined,
      sources: [],
    };
  }
  return {
    ...bundle,
    decks,
    formats,
    decksPerFormat: bundle.decksPerFormat ?? 8,
  };
}
