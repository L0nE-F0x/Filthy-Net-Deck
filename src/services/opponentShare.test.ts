import { describe, expect, it } from "vitest";
import { opponentShareCaption } from "./opponentShare";

describe("opponentShareCaption", () => {
  it("includes record and optional bits", () => {
    const t = opponentShareCaption({
      opponentName: "Alice",
      wins: 4,
      losses: 1,
      form: "WWLWW",
      tag: "Izzet Prowess",
    });
    expect(t).toContain("Alice");
    expect(t).toContain("4–1");
    expect(t).toContain("Izzet Prowess");
    expect(t).toContain("WWLWW");
    expect(t).toContain("filthy-net-deck.com");
  });
});
