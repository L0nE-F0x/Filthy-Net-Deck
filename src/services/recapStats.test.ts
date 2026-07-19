import { describe, expect, it } from "vitest";
import {
  buildRecapStats,
  dayWindow,
  formatRecapHeadline,
  lastSevenDaysWindow,
  sessionWindow,
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

describe("dayWindow", () => {
  it("spans local midnight to now", () => {
    const now = new Date(2026, 6, 19, 15, 30, 0).getTime(); // local 3:30pm
    const { fromMs, toMs } = dayWindow(now);
    expect(toMs).toBe(now);
    const from = new Date(fromMs);
    expect(from.getHours()).toBe(0);
    expect(from.getMinutes()).toBe(0);
    expect(from.getDate()).toBe(19);
  });
});

describe("sessionWindow", () => {
  const HOUR = 3600_000;
  it("keeps the latest contiguous cluster and drops the earlier one", () => {
    const now = Date.parse("2026-07-19T20:00:00Z");
    const matches = [
      match({ matchId: "a", endedAt: now - 30 * HOUR, result: "win" }), // last night
      match({ matchId: "b", endedAt: now - 29 * HOUR, result: "loss" }),
      match({ matchId: "c", endedAt: now - 2 * HOUR, result: "win" }), // tonight
      match({ matchId: "d", endedAt: now - 1 * HOUR, result: "win" }),
      match({ matchId: "e", endedAt: now, result: "loss" }),
    ];
    const { fromMs, toMs } = sessionWindow(matches, now);
    expect(toMs).toBe(now);
    // Session starts at match c (2h ago), not the 29–30h-ago block.
    expect(fromMs).toBe((now - 2 * HOUR) - 1000);
    const inWindow = matches.filter((m) => m.endedAt >= fromMs && m.endedAt <= toMs);
    expect(inWindow.map((m) => m.matchId)).toEqual(["c", "d", "e"]);
  });

  it("returns an empty [now, now] window when there are no matches", () => {
    const now = 1_000_000;
    expect(sessionWindow([], now)).toEqual({ fromMs: now, toMs: now });
  });
});
