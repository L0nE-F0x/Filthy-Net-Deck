import { describe, expect, it } from "vitest";
import { fieldExpectedWr } from "./fieldScore";
import type { DeckMatchupRow } from "./gameAnalytics";
import type { Deck } from "../types/meta";

function row(
  partial: Partial<DeckMatchupRow> & Pick<DeckMatchupRow, "archetype">,
): DeckMatchupRow {
  return {
    deckId: null,
    wins: 0,
    losses: 0,
    rate: null,
    g1: { wins: 0, games: 0, rate: null },
    post: { wins: 0, games: 0, rate: null },
    play: { wins: 0, games: 0, rate: null },
    draw: { wins: 0, games: 0, rate: null },
    form: "",
    ...partial,
  };
}

function deck(arch: string, metaShare: number): Deck {
  return {
    id: arch,
    name: arch,
    format: "standard",
    mode: "bo3",
    tier: 1,
    colors: [],
    archetype: arch,
    description: "",
    mainboard: [],
    sideboard: [],
    matchups: [],
    sideboardGuide: [],
    arenaImport: "",
    sources: [],
    metaShare,
  };
}

describe("fieldExpectedWr", () => {
  it("weights personal WR by meta share", () => {
    const score = fieldExpectedWr(
      [
        row({ archetype: "A", wins: 7, losses: 3, rate: 0.7 }),
        row({ archetype: "B", wins: 2, losses: 8, rate: 0.2 }),
      ],
      [deck("A", 10), deck("B", 10)],
      { minGames: 3 },
    );
    expect(score).not.toBeNull();
    expect(score!.rate).toBeCloseTo(0.45);
    expect(score!.rowsUsed).toBe(2);
  });

  it("returns null when sample is thin", () => {
    expect(
      fieldExpectedWr(
        [row({ archetype: "A", wins: 1, losses: 0, rate: 1 })],
        [deck("A", 12)],
        { minGames: 3 },
      ),
    ).toBeNull();
  });
});
