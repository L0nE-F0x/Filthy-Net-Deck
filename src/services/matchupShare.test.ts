import { describe, expect, it } from "vitest";
import {
  matchupShareCaption,
  matchupShareFilename,
  packageMatchupShare,
} from "./matchupShare";
import type { DeckMatchupRow } from "./gameAnalytics";
import { metaWebDeckUrl } from "./communityShare";

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

describe("packageMatchupShare", () => {
  it("returns null when no decided matchups", () => {
    expect(packageMatchupShare("Deck", [])).toBeNull();
    expect(
      packageMatchupShare("Deck", [row({ archetype: "X", wins: 0, losses: 0 })]),
    ).toBeNull();
  });

  it("packages top rows and sums overall W–L", () => {
    const input = packageMatchupShare(
      "  Izzet Control  ",
      [
        row({
          archetype: "Prowess",
          wins: 4,
          losses: 1,
          rate: 0.8,
          deckId: "d1",
        }),
        row({ archetype: "Domain", wins: 2, losses: 3, rate: 0.4 }),
        row({ archetype: "Empty", wins: 0, losses: 0 }),
      ],
      { limit: 8 },
    );
    expect(input).not.toBeNull();
    expect(input!.deckName).toBe("Izzet Control");
    expect(input!.wins).toBe(6);
    expect(input!.losses).toBe(4);
    expect(input!.rows).toHaveLength(2);
    expect(input!.rows[0].archetype).toBe("Prowess");
  });

  it("honors overall override and limit", () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      row({ archetype: `A${i}`, wins: 1, losses: 0, rate: 1 }),
    );
    const input = packageMatchupShare("D", rows, {
      limit: 3,
      overall: { wins: 20, losses: 10 },
    });
    expect(input!.rows).toHaveLength(3);
    expect(input!.wins).toBe(20);
    expect(input!.losses).toBe(10);
  });
});

describe("matchupShareCaption + filename", () => {
  it("builds caption with SEO link when deckId present", () => {
    const input = packageMatchupShare("Mardu", [
      row({
        archetype: "Izzet Prowess",
        wins: 5,
        losses: 2,
        rate: 5 / 7,
        deckId: "std-izzet",
      }),
    ])!;
    const cap = matchupShareCaption(input, metaWebDeckUrl);
    expect(cap).toContain("Mardu");
    expect(cap).toContain("Izzet Prowess 5–2");
    expect(cap).toContain(metaWebDeckUrl("std-izzet"));
  });

  it("slugifies filename", () => {
    expect(matchupShareFilename("Izzet Control!!")).toBe(
      "filthy-net-deck-matchups-izzet-control.png",
    );
  });
});
