import type { CardEntry } from "../types/meta";

/**
 * Mana curve from REAL Scryfall mana values embedded by the pipeline.
 * Cards without a cmc (older feeds) are skipped rather than guessed —
 * this app never displays estimated data.
 */
export function buildManaCurve(cards: CardEntry[]): { cmc: number; count: number }[] {
  const buckets = new Map<number, number>();
  for (let i = 0; i <= 7; i++) buckets.set(i, 0);
  for (const card of cards) {
    if (card.land || card.cmc == null) continue;
    const cmc = Math.min(Math.max(Math.round(card.cmc), 0), 7);
    buckets.set(cmc, (buckets.get(cmc) ?? 0) + card.count);
  }
  return Array.from(buckets.entries()).map(([cmc, count]) => ({ cmc, count }));
}

export function colorDistribution(
  colors: string[],
): { color: string; weight: number }[] {
  if (!colors.length) return [{ color: "C", weight: 1 }];
  return colors.map((color) => ({ color, weight: 1 / colors.length }));
}
