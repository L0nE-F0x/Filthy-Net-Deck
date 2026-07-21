import { describe, expect, it } from "vitest";
import { bodyParts, toneOf } from "./toastModel";

describe("bodyParts", () => {
  it("splits a match-end body into lead + rest", () => {
    const { lead, rest } = bodyParts("Win vs Rival · 62% this season · Diamond 1");
    expect(lead).toBe("Win vs Rival");
    expect(rest).toEqual(["62% this season", "Diamond 1"]);
  });

  it("keeps a prose alert whole so the card can wrap it", () => {
    const body = "Filthy Net Deck keeps tracking Arena from the system tray.";
    const { lead, rest } = bodyParts(body);
    expect(lead).toBe(body);
    expect(rest).toEqual([]);
  });

  it("drops empty segments from a trailing separator", () => {
    expect(bodyParts("Loss vs Rival · ").rest).toEqual([]);
  });
});

describe("toneOf", () => {
  it("reads the result off the lead", () => {
    expect(toneOf("Win vs Rival · 62% this season")).toBe("win");
    expect(toneOf("Loss vs Rival · 48% this season")).toBe("loss");
    expect(toneOf("Draw vs Rival")).toBe("draw");
  });

  it("falls back to neutral for non-match alerts", () => {
    expect(toneOf("Still running in the tray")).toBe("neutral");
    expect(toneOf("Match ended · Diamond 1")).toBe("neutral");
  });

  it("does not match a rank or deck name that merely contains 'win'", () => {
    expect(toneOf("Rewind Storm hit the board")).toBe("neutral");
  });
});
