import { describe, expect, it } from "vitest";
import { sortMatches } from "./matchHistorySort";
import type { TrackedMatch } from "../types/tracker";

function match(
  partial: Partial<TrackedMatch> &
    Pick<TrackedMatch, "matchId" | "endedAt" | "result">,
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

describe("sortMatches", () => {
  const matches = [
    match({
      matchId: "1",
      endedAt: 100,
      result: "loss",
      opponentName: "Bob",
      deckName: "Domain",
    }),
    match({
      matchId: "2",
      endedAt: 300,
      result: "win",
      opponentName: "Alice",
      deckName: "Izzet",
    }),
    match({
      matchId: "3",
      endedAt: 200,
      result: "win",
      opponentName: "Carol",
      deckName: "Izzet",
    }),
  ];

  it("sorts by when desc (newest first)", () => {
    const s = sortMatches(matches, "when", "desc");
    expect(s.map((m) => m.matchId)).toEqual(["2", "3", "1"]);
  });

  it("sorts by opponent name", () => {
    const s = sortMatches(matches, "opponent", "asc");
    expect(s.map((m) => m.opponentName)).toEqual(["Alice", "Bob", "Carol"]);
  });

  it("sorts by result order win < draw < loss", () => {
    const s = sortMatches(matches, "result", "asc");
    expect(s[0].result).toBe("win");
    expect(s[s.length - 1].result).toBe("loss");
  });
});
