import { describe, expect, it } from "vitest";
import {
  climbCaption,
  deckCardCaption,
  matchupCaption,
  metaWebDeckUrl,
  metaWebFormatUrl,
  recapCaption,
  xIntentUrl,
  SITE_URL,
  DOWNLOAD_URL,
} from "./communityShare";

describe("meta-web URLs", () => {
  it("builds format and deck SEO links", () => {
    expect(metaWebFormatUrl("standard")).toBe(
      `${SITE_URL}/meta-web/standard.html`,
    );
    expect(metaWebDeckUrl("std-izzet-prowess-bo3")).toBe(
      `${SITE_URL}/meta-web/deck/std-izzet-prowess-bo3.html`,
    );
  });

  it("encodes deck ids safely", () => {
    expect(metaWebDeckUrl("a/b")).toContain(encodeURIComponent("a/b"));
  });
});

describe("xIntentUrl", () => {
  it("puts text in the query string", () => {
    const u = xIntentUrl("hello world");
    expect(u.startsWith("https://x.com/intent/tweet")).toBe(true);
    expect(new URL(u).searchParams.get("text")).toBe("hello world");
  });
});

describe("captions", () => {
  it("recapCaption includes record, optional bits, and download link", () => {
    const t = recapCaption({
      wins: 8,
      losses: 4,
      rankDeltaLabel: "Gold 2 → Platinum 4",
      bestDeckName: "Izzet Prowess",
    });
    expect(t).toContain("8–4 (67%)");
    expect(t).toContain("Gold 2 → Platinum 4");
    expect(t).toContain("Izzet Prowess");
    expect(t).toContain(DOWNLOAD_URL);
  });

  it("climbCaption drops duplicate peak", () => {
    const t = climbCaption({
      seasonLabel: "July 2026",
      wins: 10,
      losses: 10,
      rankNow: "Diamond 3",
      rankPeak: "Diamond 3",
    });
    expect(t).toContain("Now Diamond 3");
    expect(t.match(/Diamond 3/g)?.length).toBe(1);
  });

  it("matchupCaption seeds meta deck URL when provided", () => {
    const meta = metaWebDeckUrl("deck-1");
    const t = matchupCaption({
      deckName: "Mardu Discard",
      wins: 12,
      losses: 8,
      topLines: [
        { archetype: "Izzet Prowess", wins: 5, losses: 2 },
        { archetype: "Domain", wins: 3, losses: 4 },
      ],
      metaDeckUrl: meta,
    });
    expect(t).toContain("Mardu Discard");
    expect(t).toContain("Izzet Prowess 5–2");
    expect(t).toContain(meta);
    expect(t).not.toContain(DOWNLOAD_URL);
  });

  it("matchupCaption falls back to download URL", () => {
    const t = matchupCaption({
      deckName: "Brew",
      wins: 1,
      losses: 0,
      topLines: [],
    });
    expect(t).toContain(DOWNLOAD_URL);
  });

  it("deckCardCaption includes scope label", () => {
    const t = deckCardCaption({
      deckName: "Mono Red",
      wins: 3,
      losses: 1,
      scopeLabel: "this season",
    });
    expect(t).toContain("this season");
    expect(t).toContain("3–1 (75%)");
  });
});
