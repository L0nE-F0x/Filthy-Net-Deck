import { describe, expect, it } from "vitest";
import {
  deckIdsForMode,
  inferenceCandidates,
  normalizeMetaBundle,
} from "./deckHelpers";
import type { Deck, FormatMeta, MetaBundle } from "../types/meta";

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

describe("inferenceCandidates", () => {
  const mk = (id: string, format: "standard" | "pioneer" = "standard"): Deck =>
    ({
      id,
      name: id,
      format,
      mode: id.includes("bo3") ? "bo3" : "bo1",
      tier: 1,
      colors: ["U"],
      archetype: id,
      description: "",
      mainboard: [],
      sideboard: [],
      matchups: [],
      sideboardGuide: [],
      arenaImport: "",
      sources: [],
    }) as Deck;

  it("includes both modes so Lessons twins stay in the field", () => {
    const fmt = {
      id: "standard",
      name: "Standard",
      featured: true,
      shortLabel: "STD",
      bo1DeckIds: ["standard-bo1-jeskai-lessons", "standard-bo1-izzet-lessons"],
      bo3DeckIds: ["standard-bo3-jeskai-lessons", "standard-bo3-4c-control"],
      bo1: { deckId: "standard-bo1-jeskai-lessons" },
      bo3: { deckId: "standard-bo3-jeskai-lessons" },
      tiers: [],
      metaNotes: "",
      metaShareTop: [],
    } as FormatMeta;
    const decks = {
      "standard-bo1-jeskai-lessons": mk("standard-bo1-jeskai-lessons"),
      "standard-bo1-izzet-lessons": mk("standard-bo1-izzet-lessons"),
      "standard-bo3-jeskai-lessons": mk("standard-bo3-jeskai-lessons"),
      "standard-bo3-4c-control": mk("standard-bo3-4c-control"),
      "pioneer-bo1-other": mk("pioneer-bo1-other", "pioneer"),
    };
    const c = inferenceCandidates(decks, { format: fmt, mode: "bo1" });
    expect(c.map((d) => d.id).sort()).toEqual(
      [
        "standard-bo1-izzet-lessons",
        "standard-bo1-jeskai-lessons",
        "standard-bo3-4c-control",
        "standard-bo3-jeskai-lessons",
      ].sort(),
    );
    expect(c.find((d) => d.id === "pioneer-bo1-other")).toBeUndefined();
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
