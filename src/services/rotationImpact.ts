/**
 * Rotation impact for a single deck — which of its cards leave Standard at the
 * next rotation, computed locally from the feed's rotation card-name list.
 *
 * Standard only. Basic lands never rotate (they're reprinted every set), so we
 * exclude them even if a name technically appears in a rotating set.
 */
import type { CardEntry, Deck, FormatId } from "../types/meta";
import type { RotationImpact } from "../types/sets";

const BASIC_LANDS = new Set([
  "plains",
  "island",
  "swamp",
  "mountain",
  "forest",
  "wastes",
  "snow-covered plains",
  "snow-covered island",
  "snow-covered swamp",
  "snow-covered mountain",
  "snow-covered forest",
]);

export interface DeckRotationHit {
  name: string;
  count: number;
  board: "main" | "side";
}

export interface DeckRotationResult {
  /** Cards that rotate, main then sideboard, most copies first. */
  hits: DeckRotationHit[];
  /** Total mainboard copies rotating out. */
  mainCopies: number;
  /** Total sideboard copies rotating out. */
  sideCopies: number;
  /** Distinct rotating card names. */
  distinct: number;
  nextDate: string | null;
  roughLabel: string | null;
}

function normName(name: string): string {
  // Front face only — MDFCs are legal by their full name but the rotation
  // list stores canonical names, so compare on the full string first and
  // fall back to the front face.
  return name.trim().toLowerCase();
}

/**
 * @returns null when rotation can't be assessed (no data, non-Standard deck).
 */
export function deckRotationImpact(
  deck: Pick<Deck, "format" | "mainboard" | "sideboard">,
  rotation: RotationImpact | null | undefined,
  format?: FormatId,
): DeckRotationResult | null {
  const fmt = format ?? deck.format;
  if (fmt !== "standard") return null;
  if (!rotation || !rotation.cardNames?.length) return null;

  const rotating = new Set(rotation.cardNames.map((n) => n.toLowerCase()));
  const isRotating = (c: CardEntry): boolean => {
    const full = normName(c.name);
    if (BASIC_LANDS.has(full)) return false;
    if (rotating.has(full)) return true;
    // MDFC / split — accept either half against the rotation list.
    const front = full.split(" // ")[0];
    return front !== full && rotating.has(front);
  };

  const collect = (cards: CardEntry[], board: "main" | "side"): DeckRotationHit[] =>
    cards.filter(isRotating).map((c) => ({ name: c.name, count: c.count, board }));

  const mainHits = collect(deck.mainboard || [], "main");
  const sideHits = collect(deck.sideboard || [], "side");
  const hits = [...mainHits, ...sideHits].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  );
  if (!hits.length) {
    return {
      hits,
      mainCopies: 0,
      sideCopies: 0,
      distinct: 0,
      nextDate: rotation.nextDate,
      roughLabel: rotation.roughLabel,
    };
  }

  return {
    hits,
    mainCopies: mainHits.reduce((n, h) => n + h.count, 0),
    sideCopies: sideHits.reduce((n, h) => n + h.count, 0),
    distinct: hits.length,
    nextDate: rotation.nextDate,
    roughLabel: rotation.roughLabel,
  };
}

/** Human label for when rotation lands: "Jan 15, 2027" or "Q1 2027" or "soon". */
export function rotationWhen(result: Pick<DeckRotationResult, "nextDate" | "roughLabel">): string {
  if (result.nextDate) {
    try {
      return new Date(`${result.nextDate}T12:00:00`).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return result.nextDate;
    }
  }
  return result.roughLabel || "next rotation";
}
