import { describe, expect, it } from "vitest";
import { pointInRect } from "./presenceHit";

describe("pointInRect", () => {
  const r = { left: 10, top: 20, right: 40, bottom: 50 };

  it("includes the edges", () => {
    expect(pointInRect(10, 20, r)).toBe(true);
    expect(pointInRect(40, 50, r)).toBe(true);
    expect(pointInRect(25, 35, r)).toBe(true);
  });

  it("rejects points outside and a missing rect", () => {
    expect(pointInRect(9, 35, r)).toBe(false);
    expect(pointInRect(25, 51, r)).toBe(false);
    expect(pointInRect(25, 35, null)).toBe(false);
  });
});
