import { describe, expect, it, vi } from "vitest";
import { buildArenaNameGap, colorsFromIds, manaCostFromArena, recentSetCodes } from "./sources/arena-names.mjs";

describe("colorsFromIds", () => {
  it("maps Arena's colour enum, verified against the five basics", () => {
    // Plains [1], Island [2], Swamp [3], Mountain [4], Forest [5] in mtgajson.
    expect(colorsFromIds([1])).toBe("W");
    expect(colorsFromIds([2])).toBe("U");
    expect(colorsFromIds([3])).toBe("B");
    expect(colorsFromIds([4])).toBe("R");
    expect(colorsFromIds([5])).toBe("G");
  });

  it("normalises to WUBRG order regardless of input order", () => {
    expect(colorsFromIds([4, 3])).toBe("BR");
    expect(colorsFromIds([5, 1])).toBe("WG");
    expect(colorsFromIds([3, 1, 5])).toBe("WBG");
  });

  it("returns empty for unknown or absent input rather than guessing", () => {
    // Empty must stay distinguishable from a real colourless card downstream,
    // so this never invents a value.
    expect(colorsFromIds(null)).toBe("");
    expect(colorsFromIds([])).toBe("");
    expect(colorsFromIds([99, 0, -1])).toBe("");
    expect(colorsFromIds("BR")).toBe("");
  });

  it("de-duplicates", () => {
    expect(colorsFromIds([3, 3, 4])).toBe("BR");
  });
});

const NOW = Date.parse("2026-08-12T00:00:00Z");
const day = 24 * 60 * 60 * 1000;

describe("recentSetCodes", () => {
  it("includes sets released inside the window", () => {
    const codes = recentSetCodes(
      [
        { code: "HOB", released_at: "2026-08-14" }, // 2 days out
        { code: "fin", released_at: "2026-06-01" }, // ~10 weeks ago
      ],
      NOW,
    );
    // Codes are lowercased so they join with mtgajson's, which are uppercase.
    expect([...codes].sort()).toEqual(["fin", "hob"]);
  });

  it("excludes sets older than the window", () => {
    const codes = recentSetCodes(
      [{ code: "old", released_at: new Date(NOW - 400 * day).toISOString().slice(0, 10) }],
      NOW,
    );
    expect(codes.size).toBe(0);
  });

  it("includes announced sets with no date at all", () => {
    // A set Scryfall has created but not dated is the earliest part of exactly
    // the window this exists for — dropping it would miss the first spoilers.
    const codes = recentSetCodes([{ code: "future" }, { code: "bad", released_at: "nonsense" }], NOW);
    expect([...codes].sort()).toEqual(["bad", "future"]);
  });

  it("ignores junk rows rather than throwing", () => {
    expect(recentSetCodes([null, {}, { code: "" }, undefined], NOW).size).toBe(0);
    expect(recentSetCodes(null, NOW).size).toBe(0);
  });
});

describe("manaCostFromArena", () => {
  it("converts Arena's o-prefixed notation to Scryfall's", () => {
    // Pips in the deck list and the overlay come from manaCost, not colour
    // identity, so without this a card has the right curve slot and no pips.
    expect(manaCostFromArena("oBoR")).toBe("{B}{R}");
    expect(manaCostFromArena("o1o(B/R)o(B/R)")).toBe("{1}{B/R}{B/R}");
    expect(manaCostFromArena("o2oWoW")).toBe("{2}{W}{W}");
  });

  it("handles the awkward atoms", () => {
    expect(manaCostFromArena("oX")).toBe("{X}");
    expect(manaCostFromArena("o10")).toBe("{10}"); // two digits, not {1}{0}
    expect(manaCostFromArena("oC")).toBe("{C}");
    expect(manaCostFromArena("o(B/P)")).toBe("{B/P}"); // Phyrexian
    expect(manaCostFromArena("o0")).toBe("{0}");
  });

  it("returns null rather than an empty cost when there is nothing to read", () => {
    // A land has no casting cost; null keeps that distinct from "{0}".
    expect(manaCostFromArena(null)).toBeNull();
    expect(manaCostFromArena("")).toBeNull();
    expect(manaCostFromArena(undefined)).toBeNull();
    expect(manaCostFromArena(42)).toBeNull();
  });
});

describe("buildArenaNameGap — a partial upstream failure must not delete entries", () => {
  const previous = {
    "103529": { n: "Bolg's Company", c: 2, i: "BR" },
    "103538": { n: "The Great Goblin", c: 3, i: "BR" },
  };

  it("keeps the existing map when the Scryfall set list is unavailable", async () => {
    // The regression: on 2026-08-12 a rate-limited run wrote a shrunken map
    // over the good one and deleted 573 working card names.
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("429"));
    const out = await buildArenaNameGap({ previous, tries: 1 });
    expect(out).toEqual(previous);
    fetchSpy.mockRestore();
  });

  it("keeps the existing map when mtgajson is unreachable", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((u) => {
      const url = String(u);
      if (url.endsWith("/sets")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) });
      }
      return Promise.reject(new Error("down"));
    });
    const out = await buildArenaNameGap({ previous, sets: [], tries: 1 });
    expect(out).toEqual(previous);
    fetchSpy.mockRestore();
  });

  it("never returns fewer entries than it was given when nothing could be read", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const out = await buildArenaNameGap({ previous, sets: [{ code: "hob" }], tries: 1 });
    expect(Object.keys(out).length).toBeGreaterThanOrEqual(Object.keys(previous).length);
    fetchSpy.mockRestore();
  });
});
