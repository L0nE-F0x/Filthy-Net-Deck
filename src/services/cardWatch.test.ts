import { describe, expect, it } from "vitest";
import {
  buildCardIndex,
  searchCards,
  searchDecks,
} from "./cardWatch";
import type { Deck, MetaBundle } from "../types/meta";

function deck(partial: Partial<Deck> & { id: string; name: string }): Deck {
  return {
    format: "standard",
    mode: "bo1",
    tier: 1,
    colors: [],
    archetype: partial.name,
    description: "",
    mainboard: [],
    sideboard: [],
    matchups: [],
    sideboardGuide: [],
    arenaImport: "",
    sources: [],
    ...partial,
  };
}

// "mono-red" is listed for BOTH standard bo1 and bo3 → duplicate, mode-labeled
// occurrences. "Lightning Strike" appears in its mainboard (4×) AND sideboard
// (1×) to exercise board labels.
const meta: MetaBundle = {
  generatedAt: "2026-07-18T00:00:00Z",
  date: "2026-07-18",
  formats: [
    {
      id: "standard",
      name: "Standard",
      shortLabel: "STD",
      bo1DeckIds: ["mono-red", "azorius-ctrl"],
      bo3DeckIds: ["mono-red"],
      tiers: [],
      metaNotes: "",
    },
    {
      id: "pioneer",
      name: "Pioneer",
      shortLabel: "PIO",
      bo1DeckIds: ["lotus-combo"],
      bo3DeckIds: [],
      tiers: [],
      metaNotes: "",
    },
  ],
  decks: {
    "mono-red": deck({
      id: "mono-red",
      name: "Mono Red",
      tier: 1,
      metaShare: 12.5,
      mainboard: [
        { count: 4, name: "Lightning Strike" },
        { count: 4, name: "Monastery Swiftspear" },
      ],
      sideboard: [
        { count: 1, name: "Lightning Strike" },
        { count: 2, name: "Roiling Vortex" },
      ],
    }),
    "azorius-ctrl": deck({
      id: "azorius-ctrl",
      name: "Azorius Control",
      archetype: "Azorius Control",
      tier: 2,
      mainboard: [
        { count: 3, name: "Spell Pierce" },
        { count: 2, name: "Temporary Lockdown" },
      ],
    }),
    "lotus-combo": deck({
      id: "lotus-combo",
      name: "Lotus Combo",
      archetype: "Lotus Field Combo",
      format: "pioneer",
      tier: 1,
      mainboard: [
        { count: 4, name: "Spell Pierce" },
        { count: 4, name: "Lightning Helix" },
      ],
      sideboard: [{ count: 1, name: "Blightning" }],
    }),
  },
  tournaments: [],
  sources: [],
  version: "test",
};

describe("buildCardIndex", () => {
  it("indexes mainboard and sideboard entries across formats and modes", () => {
    const index = buildCardIndex(meta);
    const strike = index.byName.get("lightning strike")!;
    // standard bo1 main, standard bo1 side, standard bo3 main, standard bo3 side
    expect(strike).toHaveLength(4);
    expect(strike.map((o) => `${o.mode}:${o.board}:${o.count}`)).toEqual([
      "bo1:main:4",
      "bo1:side:1",
      "bo3:main:4",
      "bo3:side:1",
    ]);
    expect(strike[0]).toMatchObject({
      cardName: "Lightning Strike",
      formatId: "standard",
      formatName: "Standard",
      deckId: "mono-red",
      deckName: "Mono Red",
      rank: 1,
      tier: 1,
      metaShare: 12.5,
    });
  });

  it("sorts occurrences by formatId, then mode, then rank", () => {
    const index = buildCardIndex(meta);
    const pierce = index.byName.get("spell pierce")!;
    expect(pierce.map((o) => `${o.formatId}:${o.mode}:${o.rank}`)).toEqual([
      "pioneer:bo1:1",
      "standard:bo1:2",
    ]);
  });

  it("derives rank from list position when deck.rank is missing", () => {
    const index = buildCardIndex(meta);
    const lockdown = index.byName.get("temporary lockdown")!;
    expect(lockdown[0]?.rank).toBe(2);
  });
});

describe("searchCards", () => {
  const index = buildCardIndex(meta);

  it("returns exact matches before prefix matches", () => {
    const results = searchCards(index, "lightning strike");
    expect(results[0]?.name).toBe("Lightning Strike");
  });

  it("orders prefix matches alphabetically before substring matches", () => {
    const results = searchCards(index, "lightning");
    expect(results.map((r) => r.name)).toEqual([
      "Lightning Helix",
      "Lightning Strike",
      "Blightning",
    ]);
  });

  it("finds substring matches", () => {
    const results = searchCards(index, "vortex");
    expect(results.map((r) => r.name)).toEqual(["Roiling Vortex"]);
  });

  it("is case-insensitive and trims the query", () => {
    const results = searchCards(index, "  LIGHTNING STRIKE ");
    expect(results[0]?.name).toBe("Lightning Strike");
  });

  it("returns [] for an empty query", () => {
    expect(searchCards(index, "")).toEqual([]);
    expect(searchCards(index, "   ")).toEqual([]);
  });

  it("returns [] when nothing matches", () => {
    expect(searchCards(index, "black lotus")).toEqual([]);
  });

  it("respects the limit", () => {
    expect(searchCards(index, "i", 2)).toHaveLength(2);
  });
});

describe("searchDecks", () => {
  it("matches deck names, one result per format × mode listing", () => {
    const results = searchDecks(meta, "mono red");
    expect(results).toHaveLength(2);
    expect(results.map((r) => `${r.formatId}:${r.mode}`)).toEqual([
      "standard:bo1",
      "standard:bo3",
    ]);
    expect(results[0]).toMatchObject({
      deckId: "mono-red",
      deckName: "Mono Red",
      formatName: "Standard",
      rank: 1,
      tier: 1,
    });
  });

  it("matches on archetype as well as name", () => {
    const results = searchDecks(meta, "lotus field");
    expect(results.map((r) => r.deckId)).toEqual(["lotus-combo"]);
    expect(results[0]?.formatId).toBe("pioneer");
  });

  it("matches partial deck names", () => {
    const results = searchDecks(meta, "control");
    expect(results[0]?.deckId).toBe("azorius-ctrl");
  });

  it("returns [] for empty or unmatched queries", () => {
    expect(searchDecks(meta, "")).toEqual([]);
    expect(searchDecks(meta, "elves")).toEqual([]);
  });
});
