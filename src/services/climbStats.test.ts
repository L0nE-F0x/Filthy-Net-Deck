import { describe, expect, it } from "vitest";
import {
  buildClimbLegs,
  currentStreak,
  deckClimbSummaries,
  longestStreak,
  previousSeasonSummary,
  seasonSummaries,
} from "./climbStats";
import { parseRank } from "./ranks";
import type { TrackedMatch } from "../types/tracker";

let id = 0;
function match(
  result: TrackedMatch["result"],
  endedAt: number,
  myRank?: string,
  deckName?: string,
  deckId?: string,
): TrackedMatch {
  return {
    matchId: `m${id++}`,
    startedAt: endedAt - 600_000,
    endedAt,
    result,
    myRank,
    deckName,
    deckId,
    eventId: "Ladder",
    bestOf: 1,
    myTeamId: 1,
    games: [],
  } as TrackedMatch;
}

const JUL = (day: number) => new Date(2026, 6, day, 12).getTime(); // month 6 = July
const JUN = (day: number) => new Date(2026, 5, day, 12).getTime();

describe("currentStreak", () => {
  it("is empty with no decided matches", () => {
    expect(currentStreak([])).toEqual({ type: null, length: 0 });
    expect(currentStreak([match("draw", JUL(1))])).toEqual({ type: null, length: 0 });
  });

  it("counts the latest run regardless of input order", () => {
    const matches = [
      match("loss", JUL(5)),
      match("loss", JUL(4)),
      match("loss", JUL(3)),
      match("win", JUL(2)),
    ];
    expect(currentStreak(matches)).toEqual({ type: "loss", length: 3 });
  });

  it("ignores draws when finding the newest result but breaks the run on the opposite result", () => {
    const matches = [match("win", JUL(3)), match("win", JUL(2)), match("loss", JUL(1))];
    expect(currentStreak(matches)).toEqual({ type: "win", length: 2 });
  });
});

describe("longestStreak", () => {
  it("finds the best run of a result", () => {
    const matches = [
      match("win", JUL(1)),
      match("win", JUL(2)),
      match("loss", JUL(3)),
      match("win", JUL(4)),
      match("win", JUL(5)),
      match("win", JUL(6)),
    ];
    expect(longestStreak(matches, "win")).toBe(3);
    expect(longestStreak(matches, "loss")).toBe(1);
  });
});

describe("seasonSummaries + previousSeasonSummary", () => {
  const matches = [
    // July: 2W 1L, ranks climbing
    match("win", JUL(10), "Gold 4"),
    match("win", JUL(12), "Gold 2"),
    match("loss", JUL(14), "Gold 3"),
    // June: 1W 2L
    match("loss", JUN(5), "Silver 2"),
    match("win", JUN(6), "Silver 1"),
    match("loss", JUN(7), "Silver 2"),
  ];

  it("summarizes each season, newest first", () => {
    const s = seasonSummaries(matches);
    expect(s.map((x) => x.seasonKey)).toEqual(["2026-07", "2026-06"]);
    expect(s[0]).toMatchObject({ games: 3, wins: 2, losses: 1 });
    expect(s[0].rate).toBeCloseTo(2 / 3);
    // Gold 2 is the peak; delta Gold4→Gold3 across first→last stamped
    expect(s[0].peakScore).not.toBeNull();
  });

  it("finds the season before a given one", () => {
    const prev = previousSeasonSummary(matches, "2026-07");
    expect(prev?.seasonKey).toBe("2026-06");
    expect(prev).toMatchObject({ wins: 1, losses: 2 });
  });

  it("returns null when there is no earlier season", () => {
    expect(previousSeasonSummary(matches, "2026-06")).toBeNull();
  });

  it("handles a season with no rank stamps", () => {
    const noRanks = [match("win", JUL(1)), match("loss", JUL(2))];
    const s = seasonSummaries(noRanks);
    expect(s[0].peakScore).toBeNull();
    expect(s[0].delta).toBeNull();
  });
});

describe("buildClimbLegs", () => {
  it("groups consecutive matches on the same deck", () => {
    const matches = [
      match("win", JUL(1), "Gold 4", "Mono Red", "d-red"),
      match("win", JUL(2), "Gold 3", "Mono Red", "d-red"),
      match("loss", JUL(3), "Gold 3", "Dimir", "d-dimir"),
      match("win", JUL(4), "Gold 2", "Dimir", "d-dimir"),
      match("win", JUL(5), "Gold 1", "Mono Red", "d-red"),
    ];
    const legs = buildClimbLegs(matches);
    expect(legs).toHaveLength(3);
    expect(legs[0]).toMatchObject({
      deckName: "Mono Red",
      matches: 2,
      wins: 2,
      losses: 0,
    });
    expect(legs[0].startRank?.score).toBe(parseRank("Gold 4")!.score);
    expect(legs[0].endRank?.score).toBe(parseRank("Gold 3")!.score);
    expect(legs[0].delta).toBe(1);
    expect(legs[1].deckName).toBe("Dimir");
    expect(legs[1].matches).toBe(2);
    expect(legs[2].deckName).toBe("Mono Red");
    expect(legs[2].matches).toBe(1);
  });
});

describe("deckClimbSummaries", () => {
  it("aggregates per deck and sorts by rank delta", () => {
    const matches = [
      match("win", JUL(1), "Platinum 4", "A", "a"),
      match("win", JUL(2), "Platinum 2", "A", "a"),
      match("loss", JUL(3), "Platinum 2", "B", "b"),
      match("loss", JUL(4), "Platinum 3", "B", "b"),
    ];
    const decks = deckClimbSummaries(matches);
    expect(decks[0].name).toBe("A");
    expect(decks[0].delta).toBeGreaterThan(0);
    expect(decks[1].name).toBe("B");
    expect(decks[1].delta).toBeLessThan(0);
  });
});
