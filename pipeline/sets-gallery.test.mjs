import { describe, it, expect } from "vitest";
import {
  altNamesOf,
  buildFreshSpoilers,
  mapCard,
  relatedSetCodesFor,
  tokenSetCodesFor,
} from "./sources/sets.mjs";

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

// Star Trek, a week after its full gallery (2026-11-02): Scryfall had all 581
// trk cards and the strip still held 231 "unconfirmed" ones from the same
// MythicSpoiler folder. These are the real shapes.
const TREK_SETS = [
  { code: "trk", set_type: "expansion", parent_set_code: null },
  { code: "ttrk", set_type: "token", parent_set_code: "trk" },
  { code: "atrk", set_type: "memorabilia", parent_set_code: "trk" },
  { code: "trc", set_type: "commander", parent_set_code: "trk" },
  { code: "sds", set_type: "masterpiece", parent_set_code: "trk" },
  { code: "ttrc", set_type: "token", parent_set_code: "trc" },
  { code: "atrc", set_type: "memorabilia", parent_set_code: "trc" },
  { code: "fra", set_type: "expansion", parent_set_code: null },
  { code: "frc", set_type: "commander", parent_set_code: "fra" },
];

describe("relatedSetCodesFor", () => {
  it("walks every descendant product, skipping art cards and the gallery's own token set", () => {
    expect(relatedSetCodesFor("trk", TREK_SETS).sort()).toEqual(["sds", "trc", "ttrc"]);
    expect(relatedSetCodesFor("FRA", TREK_SETS)).toEqual(["frc"]);
    expect(relatedSetCodesFor("mdd", TREK_SETS)).toEqual([]);
  });
});

describe("altNamesOf", () => {
  it("returns flavour names and face names, not the card name", () => {
    expect(
      altNamesOf({ name: "Mogis, God of Slaughter", flavor_name: "Worf, Regent of Qo'noS" }),
    ).toEqual(["Worf, Regent of Qo'noS"]);
    expect(
      altNamesOf({
        name: "A // B",
        card_faces: [{ name: "A", flavor_name: "Alpha" }, { name: "B" }],
      }),
    ).toEqual(["A", "Alpha", "B"]);
    expect(altNamesOf({ name: "Plains" })).toEqual([]);
    expect(altNamesOf(null)).toEqual([]);
  });
});

describe("buildFreshSpoilers", () => {
  const mythic = (slug) => ({ slug, name: slug, image: `https://x/${slug}.jpg` });

  it("confirms cards Scryfall knows under another name or in a sibling product", () => {
    const gallery = [{ name: "Subspace Anomaly" }, { name: "Jett Reno, Problem Solver" }];
    const known = [
      "Worf, Regent of Qo'noS", // Stardates flavour name
      "S.S. Botany Bay", // Commander, misspelt as ussbotanybay
      "Võx, Child of the Collective", // accent
    ];
    const fresh = buildFreshSpoilers(
      gallery,
      [
        mythic("supspaceanomaly"),
        mythic("jettrenoroblemsolverf"),
        mythic("worfregentofqonos"),
        mythic("ussbotanybay"),
        mythic("voxchildofthecollective"),
        mythic("brandnewcardnobodyhas"),
      ],
      known,
    );
    expect(fresh.map((c) => c.slug)).toEqual(["brandnewcardnobodyhas"]);
  });

  it("keeps a card unconfirmed when nothing knows it", () => {
    expect(buildFreshSpoilers([], [mythic("captainkirkboldlygoing")])).toHaveLength(1);
    expect(buildFreshSpoilers([{ name: "x" }], [])).toEqual([]);
  });
});
