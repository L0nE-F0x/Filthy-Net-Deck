import { describe, expect, it } from "vitest";
import {
  buildRecapStats,
  formatRecapHeadline,
  lastSevenDaysWindow,
} from "./recapStats";
import type { TrackedMatch } from "../types/tracker";

function match(
  partial: Partial<TrackedMatch> & Pick<TrackedMatch, "matchId" | "endedAt" | "result">,
): TrackedMatch {
  return {
    startedAt: partial.endedAt - 1000,
    eventId: "Ladder",
    bestOf: 1,
    myTeamId: 0,
    games: [],
    ...partial,
  };
}

describe("buildRecapStats", () => {
  it("aggregates wins/losses and best deck in window", () => {
    const now = Date.parse("2026-07-17T12:00:00Z");
    const matches = [
      match({
        matchId: "1",
        endedAt: now - 2 * 86400000,
        result: "win",
        deckName: "Izzet Prowess",
        myRank: "Diamond 3",
      }),
      match({
        matchId: "2",
        endedAt: now - 1 * 86400000,
        result: "win",
        deckName: "Izzet Prowess",
        myRank: "Diamond 2",
      }),
      match({
        matchId: "3",
        endedAt: now - 1 * 86400000,
        result: "loss",
        deckName: "Domain",
        myRank: "Diamond 2",
      }),
      match({
        matchId: "old",
        endedAt: now - 20 * 86400000,
        result: "win",
        deckName: "Ignore Me",
      }),
    ];
    const { fromMs, toMs } = lastSevenDaysWindow(now);
    const s = buildRecapStats(matches, fromMs, toMs);
    expect(s.wins).toBe(2);
    expect(s.losses).toBe(1);
    expect(s.winrate).toBeCloseTo(2 / 3);
    expect(s.bestDeck?.name).toBe("Izzet Prowess");
    expect(formatRecapHeadline(s)).toContain("67% WR");
    expect(s.rankDeltaLabel).toContain("Diamond");
  });
});
