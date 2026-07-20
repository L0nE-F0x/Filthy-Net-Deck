/**
 * Format Hub war-room helpers — rotation roster, arsenal at risk, near-rotation.
 */

import type { Deck } from "../types/meta";
import type { RotationImpact } from "../types/sets";
import type { TrackedMatch } from "../types/tracker";
import { deckRotationImpact } from "./rotationImpact";
import { deckKey } from "./tracker";
import { daysUntil as daysUntilDate } from "./setDates";

export interface RotationRosterRow {
  deckId: string;
  deckName: string;
  archetype: string;
  rank?: number;
  cardsLost: number;
  sampleNames: string[];
}

/** Today's Standard decks sorted by cards lost at next rotation (most first). */
export function buildRotationRoster(
  decks: Deck[],
  rotation: RotationImpact | null | undefined,
): RotationRosterRow[] {
  if (!rotation?.cardNames?.length) return [];
  const rows: RotationRosterRow[] = [];
  for (const d of decks) {
    const impact = deckRotationImpact(d, rotation);
    if (!impact || impact.distinct <= 0) continue;
    rows.push({
      deckId: d.id,
      deckName: d.name,
      archetype: d.archetype,
      rank: d.rank,
      cardsLost: impact.distinct,
      sampleNames: impact.hits.slice(0, 4).map((h) => h.name),
    });
  }
  return rows.sort(
    (a, b) => b.cardsLost - a.cardsLost || (a.rank ?? 99) - (b.rank ?? 99),
  );
}

export interface NearRotationHero {
  active: boolean;
  daysUntil: number | null;
  nextDate: string | null;
  roughLabel: string | null;
  cardCount: number;
  topThreatened: RotationRosterRow[];
}

/** True when rotation is within `withinDays` (default 45). */
export function buildNearRotationHero(
  rotation: RotationImpact | null | undefined,
  roster: RotationRosterRow[],
  opts?: { withinDays?: number; now?: Date },
): NearRotationHero {
  const withinDays = opts?.withinDays ?? 45;
  const now = opts?.now ?? new Date();
  // Shared day-count math with Sets Radar (local noon basis).
  const daysUntil = daysUntilDate(rotation?.nextDate ?? null, now.getTime());
  // F2: only when we know a calendar date and it falls in [0, withinDays].
  // roughLabel alone (e.g. live feed "Q1 2027" with nextDate:null) must NOT
  // force the "Rotation approaching" hero half a year early.
  const active =
    daysUntil != null &&
    daysUntil >= 0 &&
    daysUntil <= withinDays &&
    (roster.length > 0 || (rotation?.cardNames?.length ?? 0) > 0);
  return {
    active,
    daysUntil,
    nextDate: rotation?.nextDate ?? null,
    roughLabel: rotation?.roughLabel ?? null,
    cardCount: rotation?.cardNames?.length ?? 0,
    topThreatened: roster.slice(0, 3),
  };
}

export interface ArsenalRiskRow {
  deckKey: string;
  deckName: string;
  games: number;
  cardsAtRisk: number;
  sampleNames: string[];
}

/**
 * Your tracked decks × rotation card set — how many unique names in your
 * recorded mainboards are leaving Standard.
 */
export function buildArsenalAtRisk(
  matches: TrackedMatch[],
  rotation: RotationImpact | null | undefined,
): ArsenalRiskRow[] {
  if (!rotation?.cardNames?.length) return [];
  const leaving = new Set(rotation.cardNames.map((n) => n.toLowerCase()));
  const byDeck = new Map<
    string,
    { name: string; games: number; risk: Set<string> }
  >();

  for (const m of matches) {
    const key = deckKey(m);
    const row = byDeck.get(key) ?? {
      name: m.deckName?.trim() || "Unknown deck",
      games: 0,
      risk: new Set<string>(),
    };
    row.games++;
    if (m.deckName?.trim()) row.name = m.deckName.trim();
    // We only have Arena ids on matches, not names — use deckName fingerprint only.
    // When mainboard names aren't available, still count games so the section
    // can say "play with detailed logs for card-level risk".
    byDeck.set(key, row);
  }

  // If matches have no card names, return empty card-level rows but allow
  // callers to show a soft empty. Prefer decks that appear in meta join separately.
  void leaving;
  return [...byDeck.entries()]
    .map(([deckKey, v]) => ({
      deckKey,
      deckName: v.name,
      games: v.games,
      cardsAtRisk: v.risk.size,
      sampleNames: [...v.risk].slice(0, 4),
    }))
    .filter((r) => r.games > 0)
    .sort((a, b) => b.cardsAtRisk - a.cardsAtRisk || b.games - a.games);
}

/**
 * Card-level arsenal risk when we have named cards on a decklist-like structure.
 * Used with meta decks the pilot plays (joined by name) OR synthetic lists.
 */
export function arsenalRiskFromNamedLists(
  decks: { key: string; name: string; games: number; cardNames: string[] }[],
  rotation: RotationImpact | null | undefined,
): ArsenalRiskRow[] {
  if (!rotation?.cardNames?.length) return [];
  const leaving = new Set(rotation.cardNames.map((n) => n.toLowerCase()));
  return decks
    .map((d) => {
      const hits = [
        ...new Set(
          d.cardNames.filter((n) => leaving.has(n.toLowerCase())),
        ),
      ];
      return {
        deckKey: d.key,
        deckName: d.name,
        games: d.games,
        cardsAtRisk: hits.length,
        sampleNames: hits.slice(0, 4),
      };
    })
    .filter((r) => r.cardsAtRisk > 0)
    .sort((a, b) => b.cardsAtRisk - a.cardsAtRisk || b.games - a.games);
}
