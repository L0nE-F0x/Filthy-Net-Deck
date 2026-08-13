import { describe, expect, it } from "vitest";
import type { Deck, MetaBundle } from "../types/meta";
import {
  boardDiff,
  cardsOff,
  clinicReportText,
  closestRankedDeck,
  fromCardEntries,
  fromNamedLines,
  l1Distance,
  runListClinic,
  type CountedName,
} from "./brewLab";

function card(name: string, count: number, extra: Partial<CountedName> = {}): CountedName {
  return { name, count, ...extra };
}

function metaWithPeers(peers: Deck[]): MetaBundle {
  const decks: Record<string, Deck> = {};
  const ids: string[] = [];
  peers.forEach((d, i) => {
    const id = d.id || `d${i}`;
    ids.push(id);
    decks[id] = { ...d, id };
  });
  return {
    version: "test",
    date: "2026-07-20",
    generatedAt: "2026-07-20T00:00:00Z",
    formats: [
      {
        id: "standard",
        name: "Standard",
        shortLabel: "STD",
        featured: true,
        bo1DeckIds: ids,
        bo3DeckIds: ids,
        tiers: [],
        metaNotes: "",
      },
    ],
    decks,
    tournaments: [],
    sources: ["test"],
  };
}

const golgariMain = [
  { name: "Forest", count: 10, land: true, type: "other" as const, cmc: 0 },
  { name: "Swamp", count: 8, land: true, type: "other" as const, cmc: 0 },
  { name: "Llanowar Elves", count: 4, type: "creature" as const, cmc: 1 },
  { name: "Go for the Throat", count: 3, type: "instant" as const, cmc: 2 },
  { name: "Sheoldred", count: 3, type: "creature" as const, cmc: 4 },
];

const izzetMain = [
  { name: "Island", count: 10, land: true, type: "other" as const, cmc: 0 },
  { name: "Mountain", count: 8, land: true, type: "other" as const, cmc: 0 },
  { name: "Consider", count: 4, type: "instant" as const, cmc: 1 },
  { name: "Lightning Strike", count: 4, type: "instant" as const, cmc: 2 },
  { name: "Phoenix Chick", count: 4, type: "creature" as const, cmc: 1 },
];

function deck(id: string, name: string, mainboard: Deck["mainboard"], sideboard: Deck["sideboard"] = []): Deck {
  return {
    id,
    name,
    format: "standard",
    mode: "bo1",
    tier: 1,
    colors: [],
    archetype: name,
    description: "",
    mainboard,
    sideboard,
    matchups: [],
    sideboardGuide: [],
    arenaImport: "",
    sources: [],
  };
}

describe("cardsOff / l1Distance", () => {
  it("counts one swap as 1 card off", () => {
    const yours = [card("Shock", 4), card("Bolt", 0)];
    const ranked = [card("Shock", 3), card("Bolt", 1)];
    expect(l1Distance(yours, ranked)).toBe(2);
    expect(cardsOff(yours, ranked)).toBe(1);
  });

  it("is 0 for identical lists", () => {
    const a = [card("Bear", 4), card("Forest", 20)];
    expect(cardsOff(a, a)).toBe(0);
  });
});

describe("boardDiff", () => {
  it("splits extras, missing, and count changes", () => {
    const yours = [card("Shock", 4), card("Bear", 4)];
    const ranked = [card("Shock", 3), card("Bolt", 2)];
    const d = boardDiff(yours, ranked);
    expect(d.cardsOff).toBe(3.5);
    expect(d.extras.map((s) => s.name)).toEqual(["Bear"]);
    expect(d.missing.map((s) => s.name)).toEqual(["Bolt"]);
    expect(d.counts).toEqual([{ name: "Shock", yours: 4, ranked: 3 }]);
    expect(d.identical).toBe(false);
  });
});

describe("closestRankedDeck", () => {
  const meta = metaWithPeers([
    deck("g", "Golgari Midrange", golgariMain),
    deck("i", "Izzet Prowess", izzetMain),
  ]);

  it("picks the closer list, not the name match", () => {
    const yours = fromCardEntries(izzetMain);
    const hit = closestRankedDeck(yours, meta, {
      mode: "bo1",
      preferName: "Golgari Midrange",
    });
    expect(hit?.deck.id).toBe("i");
    expect(hit?.l1).toBe(0);
  });

  it("uses the name as a tie-break when distances match", () => {
    const tied = metaWithPeers([
      deck("ww", "White Weenie", [{ name: "Plains", count: 60, land: true, cmc: 0 }]),
      deck("rd", "Mono Red", [{ name: "Mountain", count: 60, land: true, cmc: 0 }]),
    ]);
    const yours = [card("Forest", 60, { land: true })];
    const hit = closestRankedDeck(yours, tied, {
      mode: "bo1",
      preferName: "Mono Red",
    });
    expect(hit?.deck.id).toBe("rd");
  });
});

describe("runListClinic", () => {
  const meta = metaWithPeers([
    deck("g", "Golgari Midrange", golgariMain, [
      { name: "Duress", count: 2, type: "sorcery", cmc: 1 },
      { name: "Cut Down", count: 2, type: "instant", cmc: 1 },
    ]),
    deck("i", "Izzet Prowess", izzetMain),
  ]);

  it("reports 0 off for an exact copy", () => {
    const report = runListClinic({
      deckName: "Golgari Midrange",
      main: fromCardEntries(golgariMain),
      meta,
      mode: "bo1",
    });
    expect(report.emptyReason).toBeUndefined();
    expect(report.rankedName).toBe("Golgari Midrange");
    expect(report.main.identical).toBe(true);
    expect(report.main.cardsOff).toBe(0);
    expect(report.nameWasOverridden).toBe(false);
  });

  it("names the closer archetype when the title lies", () => {
    const swapped = fromCardEntries([
      ...izzetMain.slice(0, -1),
      { name: "Phoenix Chick", count: 3, type: "creature", cmc: 1 },
      { name: "Monstrous Rage", count: 1, type: "instant", cmc: 1 },
    ]);
    const report = runListClinic({
      deckName: "Golgari Midrange",
      main: swapped,
      meta,
      mode: "bo1",
    });
    expect(report.rankedName).toBe("Izzet Prowess");
    expect(report.nameWasOverridden).toBe(true);
    expect(report.namedMatch).toBe("Golgari Midrange");
    expect(report.main.cardsOff).toBe(1);
    expect(report.main.extras.some((s) => s.name === "Monstrous Rage")).toBe(true);
    expect(report.main.counts.some((s) => s.name === "Phoenix Chick" && s.yours === 3)).toBe(
      true,
    );
  });

  it("diffs a sideboard when both sides have one", () => {
    const report = runListClinic({
      deckName: "Golgari Midrange",
      main: fromCardEntries(golgariMain),
      side: [card("Duress", 2), card("Haywire Mite", 2)],
      meta,
      mode: "bo1",
    });
    expect(report.side).not.toBeNull();
    expect(report.side!.cardsOff).toBe(2);
    expect(report.side!.extras.map((s) => s.name)).toEqual(["Haywire Mite"]);
    expect(report.side!.missing.map((s) => s.name)).toEqual(["Cut Down"]);
  });

  it("returns emptyReason without a list or a feed", () => {
    expect(
      runListClinic({ deckName: "X", main: [], meta, mode: "bo1" }).emptyReason,
    ).toMatch(/mainboard/i);
    expect(
      runListClinic({
        deckName: "X",
        main: fromCardEntries(golgariMain),
        meta: null,
        mode: "bo1",
      }).emptyReason,
    ).toMatch(/feed/i);
  });

  it("renders a copyable report", () => {
    const report = runListClinic({
      deckName: "My Golgari",
      main: fromCardEntries([
        ...golgariMain.filter((c) => c.name !== "Go for the Throat"),
        { name: "Cut Down", count: 3, type: "instant", cmc: 1 },
      ]),
      meta,
      mode: "bo1",
    });
    const text = clinicReportText("My Golgari", report);
    expect(text).toContain("My Golgari vs Golgari Midrange");
    expect(text).toContain("3 cards off");
    expect(text).toContain("Cut Down");
    expect(text).toContain("Go for the Throat");
    expect(text).toContain("no invented cards");
  });
});

describe("fromNamedLines", () => {
  const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

  it("maps resolved names, merges duplicates, reports unknowns", () => {
    const { cards, unknown } = fromNamedLines(
      [
        { name: "Shock", count: 2 },
        { name: "shock", count: 2 },
        { name: "Not A Card", count: 4 },
      ],
      {
        shock: { name: "Shock", typeLine: "Instant", cmc: 1 },
      },
      normalize,
    );
    expect(cards).toEqual([
      expect.objectContaining({ name: "Shock", count: 4, type: "instant" }),
    ]);
    expect(unknown).toEqual(["Not A Card"]);
  });
});
