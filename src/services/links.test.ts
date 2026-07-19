import { describe, expect, it } from "vitest";
import { canShowResultsLink, isHealthyUrl } from "./links";

describe("canShowResultsLink", () => {
  it("allows the hosts the Events feed actually ships", () => {
    expect(
      canShowResultsLink(
        "https://magic.gg/decklists/traditional-standard-ranked-decklists-july-13-2026",
      ),
    ).toBe(true);
    expect(
      canShowResultsLink(
        "https://www.mtgo.com/decklist/standard-challenge-32-2026-07-1812847697",
      ),
    ).toBe(true);
    expect(
      canShowResultsLink("https://melee.gg/Tournament/View/12345"),
    ).toBe(true);
    expect(
      canShowResultsLink("https://mtga.untapped.gg/constructed/standard/meta"),
    ).toBe(true);
  });

  it("blocks broken placeholders and random hosts", () => {
    expect(canShowResultsLink("https://mtggoldfish.com/tournament/")).toBe(false);
    expect(canShowResultsLink("https://evil.example.com/event")).toBe(false);
    expect(canShowResultsLink(null)).toBe(false);
  });
});

describe("isHealthyUrl", () => {
  it("requires http(s)", () => {
    expect(isHealthyUrl("ftp://magic.gg/x")).toBe(false);
    expect(isHealthyUrl("https://magic.gg/x")).toBe(true);
  });
});
