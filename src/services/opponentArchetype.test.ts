import { describe, expect, it } from "vitest";
import type { Deck } from "../types/meta";
import {
  confidenceFromHits,
  formatGuessLabel,
  inferOpponentArchetype,
  normalizeCardName,
  personalVsOpponentArchetypes,
  scoreDeckAgainstSeen,
} from "./opponentArchetype";
import type { TrackedMatch } from "../types/tracker";

function deck(
  id: string,
  archetype: string,
  cards: { name: string; land?: boolean }[],
  keyCards: string[] = [],
): Deck {
  return {
    id,
    name: archetype,
    format: "standard",
    mode: "bo1",
    tier: 1,
    colors: ["U", "R"],
    archetype,
    description: "",
    mainboard: cards.map((c) => ({ count: 4, name: c.name, land: c.land })),
    sideboard: [],
    matchups: [],
    sideboardGuide: [],
    arenaImport: "",
    sources: [],
    keyCards,
  };
}

const izzet = deck(
  "std-izzet",
  "Izzet Prowess",
  [
    { name: "Monastery Swiftspear" },
    { name: "Slickshot Show-Off" },
    { name: "Play with Fire" },
    { name: "Mountain", land: true },
    { name: "Spirebluff Canal", land: true },
  ],
  ["Monastery Swiftspear", "Slickshot Show-Off"],
);

const domain = deck("std-domain", "Domain", [
  { name: "Leyline Binding" },
  { name: "Heron of Redemption" },
  { name: "Atraxa, Grand Unifier" },
  { name: "Forest", land: true },
]);

const names: Record<number, string> = {
  1: "Monastery Swiftspear",
  2: "Slickshot Show-Off",
  3: "Play with Fire",
  4: "Mountain",
  9: "Leyline Binding",
  10: "Atraxa, Grand Unifier",
};

const resolve = (id: number) => names[id] ?? null;

describe("normalizeCardName", () => {
  it("uses front face of DFCs", () => {
    expect(normalizeCardName("Picklock Prankster // Free the Fae")).toBe(
      "picklock prankster",
    );
  });
});

describe("scoreDeckAgainstSeen", () => {
  it("scores distinctive hits higher than lands", () => {
    const seen = new Set([
      normalizeCardName("Monastery Swiftspear"),
      normalizeCardName("Mountain"),
    ]);
    const s = scoreDeckAgainstSeen(seen, izzet);
    expect(s.distinctiveHits).toBe(1);
    expect(s.hits.length).toBe(2);
  });
});

describe("inferOpponentArchetype", () => {
  it("picks the deck with more signature hits", () => {
    const guess = inferOpponentArchetype([1, 2, 3], resolve, [izzet, domain], {
      minHits: 2,
      minConfidence: 0.2,
    });
    expect(guess?.archetype).toBe("Izzet Prowess");
    expect(guess!.distinctiveHits).toBeGreaterThanOrEqual(2);
  });

  it("returns null when evidence is thin", () => {
    const guess = inferOpponentArchetype([4], resolve, [izzet, domain]);
    expect(guess).toBeNull();
  });

  it("returns null without names", () => {
    expect(inferOpponentArchetype([99], () => null, [izzet])).toBeNull();
  });
});

describe("personalVsOpponentArchetypes", () => {
  it("aggregates WR by inferred archetype", () => {
    const matches: TrackedMatch[] = [
      {
        matchId: "a",
        startedAt: 1,
        endedAt: 2,
        eventId: "Ladder",
        bestOf: 1,
        myTeamId: 1,
        games: [],
        result: "win",
        opponentSeen: [1, 2, 3],
      },
      {
        matchId: "b",
        startedAt: 3,
        endedAt: 4,
        eventId: "Ladder",
        bestOf: 1,
        myTeamId: 1,
        games: [],
        result: "loss",
        opponentSeen: [1, 2],
      },
      {
        matchId: "c",
        startedAt: 5,
        endedAt: 6,
        eventId: "Ladder",
        bestOf: 1,
        myTeamId: 1,
        games: [],
        result: "win",
        opponentSeen: [9, 10],
      },
    ];
    const rows = personalVsOpponentArchetypes(matches, resolve, [izzet, domain], {
      minHits: 2,
      minConfidence: 0.2,
    });
    const izz = rows.find((r) => r.archetype === "Izzet Prowess");
    expect(izz?.wins).toBe(1);
    expect(izz?.losses).toBe(1);
    expect(izz?.form).toBe("WL"); // chronological win then loss
    const dom = rows.find((r) => r.archetype === "Domain");
    expect(dom?.wins).toBe(1);
    expect(dom?.form).toBe("W");
  });
});

describe("helpers", () => {
  it("formats label", () => {
    expect(
      formatGuessLabel({
        archetype: "Izzet Prowess",
        deckId: "x",
        hits: ["a", "b"],
        distinctiveHits: 2,
        confidence: 0.72,
        poolSize: 5,
      }),
    ).toBe("Izzet Prowess · 72%");
  });

  it("confidence is 0 without hits", () => {
    expect(confidenceFromHits(0, 5, 3)).toBe(0);
  });
});
