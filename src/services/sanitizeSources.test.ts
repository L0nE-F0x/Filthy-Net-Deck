import { describe, expect, it } from "vitest";
import { sanitizeDeckDescription } from "./sanitizeSources";

describe("sanitizeDeckDescription", () => {
  it("strips the source clause + provenance sentence (MTGO/Goldfish form)", () => {
    expect(
      sanitizeDeckDescription(
        "17.1% of tracked Standard decks (264 lists) on MTGGoldfish. Representative list from recent mtgo (Standard Challenge 32).",
      ),
    ).toBe("17.1% of tracked Standard decks (264 lists).");
  });

  it("strips the source clause + provenance sentence (Untapped ladder form)", () => {
    expect(
      sanitizeDeckDescription(
        "17.2% of Standard Bo1 ladder matches on Untapped.gg (197,685 matches this meta period, 56.6% ladder winrate). Representative Scryfall-verified list from the usual sources.",
      ),
    ).toBe(
      "17.2% of Standard Bo1 ladder matches (197,685 matches this meta period, 56.6% ladder winrate).",
    );
  });

  it("handles the older 'archetype page' description form", () => {
    expect(
      sanitizeDeckDescription(
        "5.4% of tracked Standard decks (84 lists) on MTGGoldfish. Representative current list from the archetype page.",
      ),
    ).toBe("5.4% of tracked Standard decks (84 lists).");
  });

  it("is idempotent and leaves clean text untouched", () => {
    const clean = "11.5% of tracked Standard decks (177 lists).";
    expect(sanitizeDeckDescription(clean)).toBe(clean);
    expect(sanitizeDeckDescription(sanitizeDeckDescription(clean))).toBe(clean);
  });

  it("returns empty string for nullish input", () => {
    expect(sanitizeDeckDescription(undefined)).toBe("");
    expect(sanitizeDeckDescription(null)).toBe("");
    expect(sanitizeDeckDescription("")).toBe("");
  });
});
