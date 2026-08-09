import { describe, it, expect } from "vitest";
import { keepFullGalleryInline, splitSetsBundle, PREVIEW_RAIL } from "./slim-sets-feed.mjs";

const card = (n) => ({
  name: `Card ${n}`,
  scryfallId: `id-${n}`,
  rarity: "common",
});

describe("slim-sets-feed", () => {
  it("keeps full galleries inline only for spoiling/announced", () => {
    expect(keepFullGalleryInline("spoiling")).toBe(true);
    expect(keepFullGalleryInline("announced")).toBe(true);
    expect(keepFullGalleryInline("live_on_arena")).toBe(false);
    expect(keepFullGalleryInline("released")).toBe(false);
  });

  it("splits live set cards into gallery files and a short preview rail", () => {
    const cards = Array.from({ length: 40 }, (_, i) => card(i));
    const bundle = {
      date: "2026-08-09",
      sets: [
        {
          code: "fdn",
          name: "Foundations",
          status: "live_on_arena",
          cards,
        },
      ],
    };
    const { index, galleries } = splitSetsBundle(bundle);
    expect(index.sets[0].cards).toBeUndefined();
    expect(index.sets[0].previews).toHaveLength(PREVIEW_RAIL);
    expect(galleries.fdn.cards).toHaveLength(40);
    expect(galleries.fdn.code).toBe("fdn");
  });

  it("keeps spoiling sets fully inline and drops redundant previews", () => {
    const cards = [card(1), card(2), card(3)];
    const bundle = {
      date: "2026-08-09",
      sets: [
        {
          code: "eoe",
          name: "Edge of Eternities",
          status: "spoiling",
          cards,
          previews: cards.slice(0, 2),
        },
      ],
    };
    const { index, galleries } = splitSetsBundle(bundle);
    expect(index.sets[0].cards).toHaveLength(3);
    expect(index.sets[0].previews).toBeUndefined();
    expect(Object.keys(galleries)).toHaveLength(0);
  });
});
