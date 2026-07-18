import { describe, expect, it } from "vitest";
import {
  fuzzyMatchKey,
  metaOccurrencesForCard,
  resolveMetaDeck,
  resolveMetaDeckByTag,
} from "./deepLinks";
import type { Deck, FormatMeta, MetaBundle } from "../types/meta";

function deck(partial: Partial<Deck> & { id: string; name: string }): Deck {
  return {
    format: "standard",
    mode: "bo1",
    tier: 1,
    colors: ["R"],
    archetype: partial.archetype ?? partial.name,
    description: "",
    mainboard: partial.mainboard ?? [{ count: 4, name: "Lightning Bolt" }],
    sideboard: [],
    matchups: [],
    sideboardGuide: [],
    arenaImport: "",
    sources: [],
    ...partial,
  };
}

function bundle(decks: Deck[]): MetaBundle {
  const fmt: FormatMeta = {
    id: "standard",
    name: "Standard",
    featured: true,
    shortLabel: "STD",
    bo1DeckIds: decks.map((d) => d.id),
    bo3DeckIds: decks.map((d) => d.id),
    tiers: [],
    metaNotes: "",
    metaShareTop: [],
  };
  const map: Record<string, Deck> = {};
  for (const d of decks) map[d.id] = d;
  return {
    generatedAt: "",
    date: "2026-07-19",
    formats: [fmt],
    decks: map,
    tournaments: [],
    sources: [],
    version: "test",
  };
}

describe("fuzzyMatchKey", () => {
  it("prefers exact match when present", () => {
    expect(fuzzyMatchKey("Control", ["azorius control", "control"])).toBe(
      "control",
    );
  });
  it("prefers longest substring when no exact", () => {
    expect(fuzzyMatchKey("control", ["azorius control", "izzet"])).toBe(
      "azorius control",
    );
    expect(fuzzyMatchKey("Izzet Prowess", ["izzet prowess", "prowess"])).toBe(
      "izzet prowess",
    );
  });
});

describe("resolveMetaDeck", () => {
  const meta = bundle([
    deck({
      id: "std-bo1-izzet",
      name: "Izzet Prowess",
      archetype: "Izzet Prowess",
      rank: 1,
    }),
    deck({
      id: "std-bo1-dimir",
      name: "Dimir Midrange",
      archetype: "Dimir Midrange",
      rank: 2,
      mainboard: [{ count: 2, name: "Unholy Annex // Ritual Chamber" }],
    }),
  ]);

  it("resolves by exact archetype/name", () => {
    const hit = resolveMetaDeck(meta, "Izzet Prowess");
    expect(hit?.deckId).toBe("std-bo1-izzet");
  });

  it("resolves tag fuzzy to ranked deck", () => {
    const hit = resolveMetaDeckByTag(meta, "dimir");
    expect(hit?.deckId).toBe("std-bo1-dimir");
  });

  it("returns null when nothing matches", () => {
    expect(resolveMetaDeck(meta, "Boros Burn")).toBeNull();
  });
});

describe("metaOccurrencesForCard", () => {
  it("indexes cards from the live meta", () => {
    const meta = bundle([
      deck({
        id: "a",
        name: "Red",
        mainboard: [{ count: 4, name: "Lightning Bolt" }],
      }),
    ]);
    const occ = metaOccurrencesForCard(meta, "Lightning Bolt");
    expect(occ.length).toBeGreaterThan(0);
    expect(occ[0].count).toBe(4);
  });
});
