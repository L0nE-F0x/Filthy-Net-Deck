import { describe, expect, it } from "vitest";
import {
  omwPercent,
  parseSpotlightFeed,
  spotlightIsStale,
  spotlightPhase,
  spotlightRows,
  type SpotlightEvent,
} from "./spotlight";

const event: SpotlightEvent = {
  id: "wc32",
  name: "World Championship 32",
  format: "standard",
  starts: "2026-11-13",
  ends: "2026-11-15",
  showcaseUntil: "2026-11-22",
  eventUrl: "https://magic.gg/events/magic-world-championship-32",
  standingsRound: 7,
  standingsUrl: "https://magic.gg/news/magic-world-championship-32-round-7-standings",
  decks: [
    { id: "a", player: "Yuuki Ichikawa", archetype: "Boros Pixie", mainboard: [], sideboard: [] },
    { id: "b", player: "Seth Manfield", archetype: "Boros Pixie", mainboard: [], sideboard: [] },
    { id: "c", player: "Someone Else", archetype: "Dimir Control", mainboard: [], sideboard: [] },
    { id: "d", player: "Unranked Pilot", archetype: "Jund Sacrifice", mainboard: [], sideboard: [] },
  ],
  standings: [
    { rank: 1, player: "Ichikawa, Yuuki", points: 19, omw: 0.6939, deckId: "a" },
    { rank: 9, player: "Manfield, Seth", points: 12, omw: 0.5, deckId: "b" },
    { rank: 2, player: "Else, Someone", points: 18, omw: 0.6, deckId: "c" },
  ],
};

describe("spotlightPhase", () => {
  it("is live during the event, top 8 for a week, then gone", () => {
    expect(spotlightPhase(event, new Date(2026, 10, 12))).toBe("hidden");
    expect(spotlightPhase(event, new Date(2026, 10, 13))).toBe("live");
    expect(spotlightPhase(event, new Date(2026, 10, 15))).toBe("live");
    expect(spotlightPhase(event, new Date(2026, 10, 16))).toBe("showcase");
    expect(spotlightPhase(event, new Date(2026, 10, 22))).toBe("showcase");
    expect(spotlightPhase(event, new Date(2026, 10, 23))).toBe("hidden");
    expect(spotlightPhase(null)).toBe("hidden");
  });
});

describe("spotlightRows", () => {
  it("shows the field during the event and only the top 8 after", () => {
    const live = spotlightRows(event, "live");
    expect(live.map((r) => r.player)).toEqual([
      "Yuuki Ichikawa",
      "Someone Else",
      "Seth Manfield",
      "Unranked Pilot",
    ]);
    const top = spotlightRows(event, "showcase");
    expect(top.map((r) => r.deckId)).toEqual(["a", "c"]);
    expect(spotlightRows(event, "hidden")).toEqual([]);
  });
});

describe("spotlight feed helpers", () => {
  it("formats opponent match win and flags a stale live file", () => {
    expect(omwPercent(0.6939)).toBe("69.4%");
    expect(omwPercent(null)).toBeNull();
    const generated = "2026-11-14T12:00:00.000Z";
    const quiet = Date.parse("2026-11-14T14:00:00.000Z");
    const missed = Date.parse("2026-11-14T15:00:01.000Z");
    expect(spotlightIsStale(generated, "live", quiet)).toBe(false);
    expect(spotlightIsStale(generated, "live", missed)).toBe(true);
    expect(spotlightIsStale(generated, "showcase", missed)).toBe(false);
  });

  it("accepts an empty window and rejects a non constructed format", () => {
    expect(parseSpotlightFeed({ generatedAt: "t", event: null })).toEqual({
      generatedAt: "t",
      event: null,
    });
    expect(parseSpotlightFeed({ generatedAt: "t", event: { ...event, format: "modern" } })).toBe(
      null,
    );
    const parsed = parseSpotlightFeed({ generatedAt: "t", event });
    expect(parsed?.event?.decks).toHaveLength(4);
    expect(parsed?.event?.standings[0].omw).toBe(0.6939);
  });
});
