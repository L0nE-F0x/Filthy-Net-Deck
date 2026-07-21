import { describe, expect, it } from "vitest";
import {
  deslugLabel,
  groupBySet,
  normalizeSlug,
  parseNewSpoilers,
} from "./sources/mythicspoiler.mjs";

// Trimmed to the exact shape of the live newspoilers grid: two sets, a card that
// repeats under a second date header, and a template placeholder to ignore.
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
<!-- template placeholder that must never be scraped -->
<img src="../../set/cards/cardname.jpg">
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

describe("parseNewSpoilers", () => {
  it("extracts unique cards with absolute image URLs, ignoring placeholders", () => {
    const cards = parseNewSpoilers(SAMPLE);
    // 2 Hobbit + 1 Star Trek; the repeated Halfling is deduped; cardname skipped.
    expect(cards).toHaveLength(3);
    const hob = cards.filter((c) => c.code === "hob");
    expect(hob.map((c) => c.slug)).toEqual(["azogmoriasruin", "delightedhalfling"]);
    expect(hob[0].image).toBe("https://mythicspoiler.com/hob/cards/azogmoriasruin.jpg");
    expect(cards.some((c) => c.slug === "cardname")).toBe(false);
  });

  it("returns [] for HTML with no card grid", () => {
    expect(parseNewSpoilers("<html><body>nothing here</body></html>")).toHaveLength(0);
  });
});

describe("groupBySet", () => {
  it("buckets cards by set code", () => {
    const by = groupBySet(parseNewSpoilers(SAMPLE));
    expect(Object.keys(by).sort()).toEqual(["hob", "trk"]);
    expect(by.hob).toHaveLength(2);
    expect(by.trk[0].slug).toBe("thepicardmaneuver");
  });
});
