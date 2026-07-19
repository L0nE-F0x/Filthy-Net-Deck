import { describe, expect, it } from "vitest";
import { isSkinId, SKINS } from "./theme";

describe("planeswalker skins", () => {
  it("lists Classic plus seven walkers", () => {
    expect(SKINS.map((s) => s.id)).toEqual([
      "classic",
      "chandra",
      "teferi",
      "liliana",
      "ajani",
      "elspeth",
      "ugin",
      "garruk",
    ]);
  });

  it("validates skin ids", () => {
    expect(isSkinId("chandra")).toBe(true);
    expect(isSkinId("classic")).toBe(true);
    expect(isSkinId("ugin")).toBe(true);
    expect(isSkinId("garruk")).toBe(true);
    expect(isSkinId("jace")).toBe(false);
    expect(isSkinId("")).toBe(false);
  });

  it("every skin has three preview swatches", () => {
    for (const s of SKINS) {
      expect(s.swatches).toHaveLength(3);
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.blurb.length).toBeGreaterThan(0);
    }
  });
});
