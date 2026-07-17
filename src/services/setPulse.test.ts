import { describe, expect, it } from "vitest";
import { newCardsBySet, totalNewCount } from "./setPulse";
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
