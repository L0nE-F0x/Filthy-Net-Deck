/**
 * Regression: a real match, 2026-08-11. The opponent was Esper — Kaito, black
 * removal, black creatures, a white instant — and the overlay called them
 * **4c Control**, a deck they shared not one card with.
 *
 * Replaying their nine revealed cards against the live field reproduced it
 * exactly, and the reason was visible in the guess itself:
 *
 *     hits: ["Watery Grave", "Bleachbone Verge", "Multiversal Passage",
 *            "Requiting Hex"]   distinctiveHits: 1
 *
 * Three of the four "matches" were LANDS. Two compounding defects:
 *
 * 1. The candidate gate accepted a list on land overlap alone (`hits.length <
 *    minHits + 1`). A four-colour pile plays every dual and utility land in the
 *    format, so it matched whatever anyone put on the table and out-hit the one
 *    card — Kaito — that actually named the opponent's deck.
 *
 * 2. Extra colours were free. `colorFitPenalty` punished a list only for
 *    MISSING a proven colour, so a WUBR list facing a WUB opponent paid
 *    nothing. Nine cards including four lands, not one of them red, and red
 *    still cost the candidate nothing.
 *
 * Measured two ways.
 *
 * Synthetic, with each list held OUT of the candidate set so the engine is
 * asked about a deck it does not know (the ordinary ladder case): late-game
 * reads claiming a colour the opponent never showed fell 28.4% -> 1.7%, and
 * reads with exactly the right colours rose 42.1% -> 57.0%.
 *
 * Real, over the owner's own 322 tracked matches that revealed 5+ cards,
 * against the live meta feed:
 *
 *     old   read 95.3%   claimed an untraced colour 25.8%
 *     new   read 92.9%   claimed an untraced colour  5.9%
 *
 * One read in four used to name a deck needing a colour the opponent had shown
 * no trace of. Neither engine ever named a deck that could not cast a colour
 * the opponent had actually proved, so nothing was traded away for it beyond
 * 2.4% of reads becoming an honest "no read".
 */

import { describe, expect, it } from "vitest";
import { inferOpponentArchetype, type SeenCardInfo } from "./opponentArchetype";
import type { Deck, ManaColor } from "../types/meta";

/** The nine cards the tracker actually recorded, with real Scryfall data. */
const REAL_MATCH: Record<number, SeenCardInfo> = {
  68740: {
    name: "Watery Grave",
    manaCost: null,
    typeLine: "Land — Island Swamp",
    isLand: true,
    colorIdentity: ["B", "U"],
  },
  92314: {
    name: "Kaito, Bane of Nightmares",
    manaCost: "{2}{U}{B}",
    typeLine: "Legendary Planeswalker — Kaito",
    isLand: false,
    colorIdentity: ["B", "U"],
  },
  95052: {
    name: "Bleachbone Verge",
    manaCost: null,
    typeLine: "Land",
    isLand: true,
    colorIdentity: ["B", "W"],
  },
  96172: {
    name: "Starting Town",
    manaCost: null,
    typeLine: "Land — Town",
    isLand: true,
    colorIdentity: [],
  },
  97998: {
    name: "Multiversal Passage",
    manaCost: null,
    typeLine: "Land",
    isLand: true,
    colorIdentity: [],
  },
  98436: {
    name: "Requiting Hex",
    manaCost: "{B}",
    typeLine: "Instant",
    isLand: false,
    colorIdentity: ["B"],
  },
  100469: {
    name: "The Last Ronin's Technique",
    manaCost: "{3}{W}",
    typeLine: "Instant",
    isLand: false,
    colorIdentity: ["W"],
  },
  100519: {
    name: "Dream Beavers",
    manaCost: "{B}",
    typeLine: "Creature — Beaver Nightmare",
    isLand: false,
    colorIdentity: ["B"],
  },
  100540: {
    name: "Super Shredder",
    manaCost: "{1}{B}",
    typeLine: "Legendary Creature — Mutant Ninja Human",
    isLand: false,
    colorIdentity: ["B"],
  },
};
const SEEN = Object.keys(REAL_MATCH).map(Number);
const resolve = (id: number) => REAL_MATCH[id] ?? null;

function deck(
  id: string,
  archetype: string,
  colors: ManaColor[],
  cards: { name: string; land?: boolean }[],
  keyCards: string[] = [],
): Deck {
  return {
    id,
    name: archetype,
    archetype,
    colors,
    format: "standard",
    mode: "bo1",
    mainboard: cards.map((c) => ({ name: c.name, count: 4, land: c.land })),
    sideboard: [],
    keyCards,
  } as unknown as Deck;
}

/**
 * The shape of the real field: a four-colour pile that plays every land, and a
 * two-colour deck that plays the one card that actually identifies the
 * opponent. Land lists are deliberately overlapping — that is the trap.
 */
const fourColour = deck(
  "4c",
  "4c Control",
  ["W", "U", "B", "R"],
  [
    { name: "Starting Town", land: true },
    { name: "Multiversal Passage", land: true },
    { name: "Bleachbone Verge", land: true },
    { name: "Watery Grave", land: true },
    { name: "Requiting Hex" },
    { name: "Lightning Helix" },
    { name: "Beans" },
  ],
  ["Beans"],
);

const dimir = deck(
  "dimir",
  "Dimir Midrange",
  ["U", "B"],
  [
    { name: "Watery Grave", land: true },
    { name: "Multiversal Passage", land: true },
    { name: "Kaito, Bane of Nightmares" },
    { name: "Sheoldred" },
  ],
  ["Kaito, Bane of Nightmares"],
);

const candidates = [fourColour, dimir];

describe("lands must not carry a read (real match, 2026-08-11)", () => {
  it("never names a list whose colour the opponent has shown no trace of", () => {
    const guess = inferOpponentArchetype(SEEN, resolve, candidates, {
      minHits: 2,
      minConfidence: 0.35,
    });
    expect(guess).not.toBeNull();
    expect(guess!.archetype).not.toContain("4c");
    // Whatever it says, red is not in it: nine cards, four of them lands, and
    // not one with red anywhere in its colour identity.
    expect(guess!.archetype).not.toMatch(/Grixis|Mardu|Jund|Boros|Izzet|Rakdos/);
  });

  it("reads the colours the opponent actually proved", () => {
    const guess = inferOpponentArchetype(SEEN, resolve, candidates, {
      minHits: 2,
      minConfidence: 0.35,
    });
    expect([...guess!.observedColors].sort()).toEqual(["B", "U", "W"]);
  });

  it("refuses on lands alone rather than naming the deck that plays them all", () => {
    // The first few turns of that game: three lands, nothing else. Every one of
    // them is in the four-colour list. That must not be an archetype read.
    const lands = [96172, 97998, 95052];
    const guess = inferOpponentArchetype(lands, resolve, candidates, {
      minHits: 2,
      minConfidence: 0.35,
    });
    expect(guess).toBeNull();
  });

  it("still identifies a deck from its own cards", () => {
    // Same opponent, but now casting the card only Dimir Midrange plays plus a
    // second real hit. Cards they actually cast are what a read is made of.
    const withSheoldred = {
      ...REAL_MATCH,
      12345: {
        name: "Sheoldred",
        manaCost: "{2}{B}{B}",
        typeLine: "Legendary Creature — Phyrexian Praetor",
        isLand: false,
        colorIdentity: ["B"],
      },
    };
    const guess = inferOpponentArchetype(
      [...SEEN, 12345],
      (id) => withSheoldred[id as keyof typeof withSheoldred] ?? null,
      candidates,
      { minHits: 2, minConfidence: 0.3 },
    );
    expect(guess!.baseArchetype).toBe("Dimir Midrange");
  });
});
