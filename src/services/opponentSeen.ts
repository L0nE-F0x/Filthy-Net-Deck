import { arenaCardName } from "./arenaImport";

/** One distinct card the tracker saw the opponent reveal. */
export interface RevealedCard {
  id: number;
  name: string;
  art: string | null;
  isLand: boolean;
  typeLine: string;
  /** Name not resolved yet — shown as `Card #<grpId>`. */
  pending: boolean;
}

export type RevealedPeek = (id: number) => {
  name?: string | null;
  artUrl?: string | null;
  isLand?: boolean;
  typeLine?: string | null;
} | null | undefined;

/** Distinct Arena grpIds, first-seen order preserved. */
export function distinctSeenGrpIds(
  ids: number[] | null | undefined,
): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const id of ids ?? []) {
    if (!Number.isFinite(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function seenCardCount(ids: number[] | null | undefined): number {
  return distinctSeenGrpIds(ids).length;
}

/**
 * Resolve seen grpIds into a display list. Unresolved ids stay as
 * `Card #<id>` so a match can still be reconstructed while names load.
 * Spells first, then lands, then still-pending; names A–Z inside a group.
 */
export function revealedCardsOf(
  ids: number[] | null | undefined,
  peek: RevealedPeek,
): RevealedCard[] {
  return distinctSeenGrpIds(ids)
    .map((id): RevealedCard => {
      const m = peek(id);
      if (!m?.name) {
        return {
          id,
          name: `Card #${id}`,
          art: null,
          isLand: false,
          typeLine: "",
          pending: true,
        };
      }
      return {
        id,
        name: m.name,
        art: m.artUrl ?? null,
        isLand: Boolean(m.isLand),
        typeLine: m.typeLine ?? "",
        pending: false,
      };
    })
    .sort((a, b) => {
      if (a.pending !== b.pending) return Number(a.pending) - Number(b.pending);
      if (a.isLand !== b.isLand) return Number(a.isLand) - Number(b.isLand);
      return a.name.localeCompare(b.name);
    });
}

/**
 * Arena import of just the revealed cards (1 of each distinct name).
 * Front faces only — the importer rejects "Front // Back". Empty when
 * nothing has resolved yet.
 */
export function revealedListText(
  cards: Pick<RevealedCard, "name" | "pending">[],
): string {
  const lines = cards
    .filter((c) => !c.pending)
    .map((c) => `1 ${arenaCardName(c.name)}`);
  if (lines.length === 0) return "";
  return ["Deck", ...lines].join("\n");
}
