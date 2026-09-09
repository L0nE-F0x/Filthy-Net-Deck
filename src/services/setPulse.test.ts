import { describe, expect, it } from "vitest";
import { newCardsBySet, spoilerPulseDismissKey, totalNewCount } from "./setPulse";
import type { SetsBundle, UpcomingSet } from "../types/sets";
import { setGalleryCards, setPlayableCards } from "../types/sets";

const bundle = {
  date: "2026-07-17",
  sets: [
    {
      code: "eoe",
      name: "Edge of Eternities",
      cards: [
        { scryfallId: "a", name: "A" },
        { scryfallId: "b", name: "B" },
        { scryfallId: "c", name: "C" },
      ],
    },
  ],
} as unknown as SetsBundle;

describe("newCardsBySet", () => {
  it("reports only ids missing from previous snap", () => {
    const fresh = newCardsBySet(bundle, { eoe: ["a", "b"] });
    expect(fresh.eoe).toEqual(["c"]);
    expect(totalNewCount(fresh)).toBe(1);
  });

  it("skips first visit (no prior snap for set)", () => {
    expect(newCardsBySet(bundle, {})).toEqual({});
  });
});

describe("setGalleryCards vs playable", () => {
  it("keeps tokens off the playable rail but in the open gallery", () => {
    const set = {
      code: "fra",
      cards: [
        { scryfallId: "a", name: "A" },
        { scryfallId: "b", name: "B" },
      ],
      tokens: [{ scryfallId: "t", name: "Illusion", isToken: true }],
    } as unknown as UpcomingSet;
    expect(setPlayableCards(set).map((c) => c.scryfallId)).toEqual(["a", "b"]);
    expect(setGalleryCards(set).map((c) => c.scryfallId)).toEqual(["a", "b", "t"]);
  });
});

describe("spoilerPulseDismissKey", () => {
  it("changes when the set event changes so a new pulse can reappear", () => {
    const spoiling = spoilerPulseDismissKey({
      code: "eoe",
      kind: "spoiling",
      arenaDate: null,
    });
    const tomorrow = spoilerPulseDismissKey({
      code: "eoe",
      kind: "arena_tomorrow",
      arenaDate: "2026-09-15",
    });
    expect(spoiling).toBe("eoe:spoiling:");
    expect(tomorrow).toBe("eoe:arena_tomorrow:2026-09-15");
    expect(spoiling).not.toBe(tomorrow);
  });
});
