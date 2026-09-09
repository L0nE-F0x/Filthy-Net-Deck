import { describe, it, expect } from "vitest";
import { mapCard, tokenSetCodesFor } from "./sources/sets.mjs";

describe("mapCard colour + token fields", () => {
  it("writes colour identity for lands and skips isToken on playable cards", () => {
    const c = mapCard({
      id: "plains-1",
      name: "Plains",
      colors: [],
      color_identity: ["W"],
      type_line: "Basic Land — Plains",
      legalities: {},
    });
    expect(c.colorIdentity).toEqual(["W"]);
    expect(c.colors).toEqual([]);
    expect(c.isToken).toBeUndefined();
  });

  it("flags tokens from the child set fetch", () => {
    const c = mapCard(
      {
        id: "tok-1",
        name: "Illusion",
        colors: ["U"],
        color_identity: ["U"],
        type_line: "Token Creature — Illusion",
        layout: "token",
        legalities: {},
      },
      { isToken: true },
    );
    expect(c.isToken).toBe(true);
    expect(c.colorIdentity).toEqual(["U"]);
  });
});

describe("tokenSetCodesFor", () => {
  it("returns child token-set codes for the parent expansion", () => {
    const all = [
      { code: "tfra", set_type: "token", parent_set_code: "fra" },
      { code: "tfoo", set_type: "token", parent_set_code: "foo" },
      { code: "fra", set_type: "expansion", parent_set_code: null },
    ];
    expect(tokenSetCodesFor("fra", all)).toEqual(["tfra"]);
    expect(tokenSetCodesFor("FRA", all)).toEqual(["tfra"]);
    expect(tokenSetCodesFor("eoe", all)).toEqual([]);
  });
});
