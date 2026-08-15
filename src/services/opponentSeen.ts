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
  /** Most copies seen simultaneously in any one game (1 when unknown). */
  qty: number;
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

/** grpId → how many copies the tracker recorded (repeats in the raw list). */
export function seenQtyByGrpId(
  ids: number[] | null | undefined,
): Map<number, number> {
  const qty = new Map<number, number>();
  for (const id of ids ?? []) {
    if (!Number.isFinite(id)) continue;
    qty.set(id, (qty.get(id) ?? 0) + 1);
  }
  return qty;
}

export function seenCardCount(ids: number[] | null | undefined): number {
  return distinctSeenGrpIds(ids).length;
}

/** Total copies (sum of quantities), not distinct names. */
export function seenCopyCount(ids: number[] | null | undefined): number {
  let n = 0;
  for (const id of ids ?? []) {
    if (Number.isFinite(id)) n += 1;
  }
  return n;
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
  const qty = seenQtyByGrpId(ids);
  return distinctSeenGrpIds(ids)
    .map((id): RevealedCard => {
      const copies = qty.get(id) ?? 1;
      const m = peek(id);
      if (!m?.name) {
        return {
          id,
          name: `Card #${id}`,
          art: null,
          isLand: false,
          typeLine: "",
          pending: true,
          qty: copies,
        };
      }
      return {
        id,
        name: m.name,
        art: m.artUrl ?? null,
        isLand: Boolean(m.isLand),
        typeLine: m.typeLine ?? "",
        pending: false,
        qty: copies,
      };
    })
    .sort((a, b) => {
      if (a.pending !== b.pending) return Number(a.pending) - Number(b.pending);
      if (a.isLand !== b.isLand) return Number(a.isLand) - Number(b.isLand);
      if (a.qty !== b.qty) return b.qty - a.qty;
      return a.name.localeCompare(b.name);
    });
}

/**
 * Arena import of the revealed cards with recorded quantities.
 * Front faces only — the importer rejects "Front // Back". Empty when
 * nothing has resolved yet.
 */
export function revealedListText(
  cards: Pick<RevealedCard, "name" | "pending" | "qty">[],
): string {
  const lines = cards
    .filter((c) => !c.pending)
    .map((c) => `${Math.max(1, c.qty)} ${arenaCardName(c.name)}`);
  if (lines.length === 0) return "";
  return ["Deck", ...lines].join("\n");
}
