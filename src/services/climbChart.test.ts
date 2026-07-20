import { describe, expect, it } from "vitest";
import { deckSwatch, monotonePath } from "./climbChart";

describe("deckSwatch", () => {
  it("is stable for the same key", () => {
    expect(deckSwatch("izzet")).toBe(deckSwatch("izzet"));
  });
  it("falls back when palette is empty", () => {
    expect(deckSwatch("x", [])).toBe("#888");
  });
});

describe("monotonePath", () => {
  it("handles empty and single points", () => {
    expect(monotonePath([])).toBe("");
    expect(monotonePath([{ x: 1, y: 2 }])).toBe("M 1.0 2.0");
  });
  it("emits cubic segments for 2+ points", () => {
    const d = monotonePath([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 5 },
    ]);
    expect(d.startsWith("M 0.0 0.0")).toBe(true);
    expect(d).toContain("C");
  });
});
