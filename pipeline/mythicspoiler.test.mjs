import { describe, expect, it } from "vitest";
import {
  deslugLabel,
  groupBySet,
  isConfirmedSlug,
  mergeSpoilerLists,
  normalizeSlug,
  parseMonthDay,
  parseNewSpoilers,
  parseSetGallery,
  parseSetLabel,
  remapGenericFolders,
} from "./sources/mythicspoiler.mjs";

// Trimmed to the exact shape of the live newspoilers grid: two sets, a card that
// repeats under a second date header, a generic-folder first-look, and a
// template placeholder to ignore.
const SAMPLE = `
<div class="grid-span">JULY 20<br>THE HOBBIT</div>
<div class="grid-card"><a href="
hob/cards/azogmoriasruin.html
"><img class="hobcard" src="
hob/cards/azogmoriasruin.jpg
"></a><a href="https://example.com/leak">abentu</a></div>
<div class="grid-card"><a href="
hob/cards/delightedhalfling.html
"><img class="hobcard" src="
hob/cards/delightedhalfling.jpg
"></a></div>
<div class="grid-span">JULY 18<br>THE HOBBIT - SCENE CARDS</div>
<div class="grid-card"><a href="hob/cards/delightedhalfling.html"><img src="hob/cards/delightedhalfling.jpg"></a></div>
<div class="grid-span">JULY 14<br>STAR TREK</div>
<div class="grid-card"><a href="trk/cards/thepicardmaneuver.html"><img src="trk/cards/thepicardmaneuver.jpg"></a></div>
<div class="grid-span">SEPTEMBER 1<br>REALITY FRACTURE</div>
<div class="grid-card"><a href="mtg/cards/solitarycell.html"><img src="mtg/cards/solitarycell.jpg"></a></div>
<!-- template placeholder that must never be scraped -->
<img src="../../set/cards/cardname.jpg">
`;

const SET_PAGE = `
<a href="cards/ajaniresolute.html"><img src="cards/ajaniresolute.jpg"></a>
<a href="cards/loyaltutor.html"><img src="cards/loyaltutor.jpg"></a>
<img src="cards/inviscard.png">
<a href="cards/ajaniresolute.html"><img src="cards/ajaniresolutep.jpg"></a>
<a href="cards/loyaltutorp2.html"><img src="cards/loyaltutorp2.jpg"></a>
`;

describe("normalizeSlug", () => {
  it("matches a Scryfall name to its MythicSpoiler slug", () => {
    expect(normalizeSlug("Delighted Halfling")).toBe("delightedhalfling");
    expect(normalizeSlug("Azog, Moria's Ruin")).toBe("azogmoriasruin");
  });
});

describe("deslugLabel", () => {
  it("produces a non-authoritative fallback label", () => {
    expect(deslugLabel("azogmoriasruin")).toBe("Azogmoriasruin");
    expect(deslugLabel("")).toBe("");
  });
});

describe("parseMonthDay", () => {
  it("builds an ISO date from a month-day header", () => {
    expect(parseMonthDay("SEPTEMBER 8", "2026-09-09")).toBe("2026-09-08");
    expect(parseMonthDay("July 20", "2026-09-09")).toBe("2026-07-20");
  });

  it("rolls the year back when the date would be far in the future", () => {
    expect(parseMonthDay("NOVEMBER 2", "2026-01-15")).toBe("2025-11-02");
  });
});

describe("parseSetLabel", () => {
  it("strips the date and product suffixes", () => {
    expect(parseSetLabel("SEPTEMBER 8 REALITY FRACTURE - SPECIAL GUESTS")).toBe(
      "REALITY FRACTURE",
    );
    expect(parseSetLabel("JULY 18 THE HOBBIT - SCENE CARDS")).toBe("THE HOBBIT");
  });
});

describe("parseNewSpoilers", () => {
  it("extracts unique cards with absolute image URLs, ignoring placeholders", () => {
    const cards = parseNewSpoilers(SAMPLE, "2026-09-09");
    // 2 Hobbit + 1 Star Trek + 1 generic-folder FRA; the repeated Halfling is
    // deduped; cardname skipped.
    expect(cards).toHaveLength(4);
    const hob = cards.filter((c) => c.code === "hob");
    expect(hob.map((c) => c.slug)).toEqual(["azogmoriasruin", "delightedhalfling"]);
    expect(hob[0].image).toBe("https://mythicspoiler.com/hob/cards/azogmoriasruin.jpg");
    expect(cards.some((c) => c.slug === "cardname")).toBe(false);
  });

  it("attaches the date-header day to each card", () => {
    const cards = parseNewSpoilers(SAMPLE, "2026-09-09");
    const bySlug = Object.fromEntries(cards.map((c) => [c.slug, c]));
    expect(bySlug.azogmoriasruin.spoiledAt).toBe("2026-07-20");
    expect(bySlug.thepicardmaneuver.spoiledAt).toBe("2026-07-14");
    expect(bySlug.solitarycell.spoiledAt).toBe("2026-09-01");
    expect(bySlug.solitarycell.setLabel).toBe("REALITY FRACTURE");
  });

  it("returns [] for HTML with no card grid", () => {
    expect(parseNewSpoilers("<html><body>nothing here</body></html>")).toHaveLength(0);
  });
});

describe("remapGenericFolders", () => {
  it("moves mtg/ first-looks onto the header's set code without rewriting the image host path", () => {
    const cards = remapGenericFolders(parseNewSpoilers(SAMPLE, "2026-09-09"), {
      "reality fracture": "fra",
      "the hobbit": "hob",
    });
    const cell = cards.find((c) => c.slug === "solitarycell");
    expect(cell.code).toBe("fra");
    expect(cell.image).toBe("https://mythicspoiler.com/mtg/cards/solitarycell.jpg");
  });
});

describe("parseSetGallery", () => {
  it("reads relative cards/slug.jpg paths and drops showcase frames of a slug already present", () => {
    const cards = parseSetGallery(SET_PAGE, "fra");
    expect(cards.map((c) => c.slug).sort()).toEqual(["ajaniresolute", "loyaltutor"]);
    expect(cards[0].image).toMatch(/\/fra\/cards\//);
  });
});

describe("mergeSpoilerLists", () => {
  it("keeps primary dates and fills gaps from the set page", () => {
    const primary = parseNewSpoilers(SAMPLE, "2026-09-09");
    const extra = parseSetGallery(SET_PAGE, "fra");
    const merged = mergeSpoilerLists(primary, extra);
    expect(merged.some((c) => c.slug === "azogmoriasruin")).toBe(true);
    expect(merged.some((c) => c.slug === "ajaniresolute")).toBe(true);
  });
});

describe("isConfirmedSlug", () => {
  it("matches exact slugs and basic-land art variants", () => {
    const confirmed = new Set(["plains", "delightedhalfling"]);
    expect(isConfirmedSlug("plains", confirmed)).toBe(true);
    expect(isConfirmedSlug("plainst", confirmed)).toBe(true);
    expect(isConfirmedSlug("plainsm", confirmed)).toBe(true);
    expect(isConfirmedSlug("plainsb", confirmed)).toBe(true);
    expect(isConfirmedSlug("islandt", confirmed)).toBe(false);
    expect(isConfirmedSlug("delightedhalfling", confirmed)).toBe(true);
    expect(isConfirmedSlug("austerecommand", confirmed)).toBe(false);
  });
});

describe("groupBySet", () => {
  it("buckets cards by set code", () => {
    const by = groupBySet(parseNewSpoilers(SAMPLE, "2026-09-09"));
    expect(Object.keys(by).sort()).toEqual(["hob", "mtg", "trk"]);
    expect(by.hob).toHaveLength(2);
    expect(by.trk[0].slug).toBe("thepicardmaneuver");
    expect(by.hob[0].spoiledAt).toBe("2026-07-20");
  });
});
