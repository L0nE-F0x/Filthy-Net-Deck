import { describe, expect, it } from "vitest";
import { newCardsBySet, spoilerPulseDismissKey, totalNewCount } from "./setPulse";
import type { SetsBundle } from "../types/sets";

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
