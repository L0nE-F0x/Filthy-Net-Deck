import { describe, expect, it } from "vitest";
import { deckIdsForMode, normalizeMetaBundle } from "./deckHelpers";
import type { FormatMeta, MetaBundle } from "../types/meta";

describe("deckIdsForMode", () => {
  it("prefers bo1DeckIds / bo3DeckIds arrays", () => {
    const fmt = {
      id: "standard",
      name: "Standard",
      featured: true,
      shortLabel: "STD",
      bo1DeckIds: ["a", "b", "c"],
      bo3DeckIds: ["x", "y"],
      bo1: { deckId: "a" },
      bo3: { deckId: "x" },
      tiers: [],
      metaNotes: "",
      metaShareTop: [],
    } as FormatMeta;
    expect(deckIdsForMode(fmt, "bo1")).toEqual(["a", "b", "c"]);
    expect(deckIdsForMode(fmt, "bo3")).toEqual(["x", "y"]);
  });
});

describe("normalizeMetaBundle", () => {
  it("fills deck id arrays from legacy single slots", () => {
    const bundle = normalizeMetaBundle({
      generatedAt: "",
      date: "2026-07-17",
      formats: [
        {
          id: "standard",
          name: "Standard",
          featured: true,
          shortLabel: "STD",
          bo1: { deckId: "std-bo1-a" },
          bo3: { deckId: "std-bo3-a" },
          tiers: [],
          metaNotes: "",
          metaShareTop: [],
        },
      ],
      decks: {},
      tournaments: [],
      sources: [],
      version: "1",
    } as unknown as MetaBundle);
    expect(bundle.formats[0].bo1DeckIds).toEqual(["std-bo1-a"]);
    expect(bundle.formats[0].bo3DeckIds).toEqual(["std-bo3-a"]);
  });
});
