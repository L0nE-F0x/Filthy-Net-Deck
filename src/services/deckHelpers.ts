import type { Deck, FormatMeta, MetaBundle, PlayMode } from "../types/meta";

/** Resolve 8 ranked deck ids for a format + mode (supports legacy single-deck feeds). */
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
  return {
    ...bundle,
    formats,
    decksPerFormat: bundle.decksPerFormat ?? 8,
  };
}
