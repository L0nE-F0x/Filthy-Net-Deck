import { describe, expect, it } from "vitest";
import { recentSetCodes } from "./sources/arena-names.mjs";

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
