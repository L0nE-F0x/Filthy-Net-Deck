import { describe, expect, it } from "vitest";
import { queueSplits } from "./queueAnalytics";
import type { TrackedMatch } from "../types/tracker";

function match(
  partial: Partial<TrackedMatch> &
    Pick<TrackedMatch, "matchId" | "endedAt" | "result" | "eventId">,
): TrackedMatch {
  return {
    startedAt: partial.endedAt - 1000,
    bestOf: partial.bestOf ?? 1,
    myTeamId: 0,
    games: [],
    ...partial,
  };
}

describe("queueSplits", () => {
  it("aggregates by eventId with labels", () => {
    const rows = queueSplits([
      match({
        matchId: "1",
        endedAt: 1,
        result: "win",
        eventId: "Ladder",
      }),
      match({
        matchId: "2",
        endedAt: 2,
        result: "loss",
        eventId: "Ladder",
      }),
      match({
        matchId: "3",
        endedAt: 3,
        result: "win",
        eventId: "Traditional_Ladder",
        bestOf: 3,
      }),
    ]);
    expect(rows).toHaveLength(2);
    const ladder = rows.find((r) => r.eventId === "Ladder")!;
    expect(ladder.wins).toBe(1);
    expect(ladder.losses).toBe(1);
    expect(ladder.rate).toBe(0.5);
    const trad = rows.find((r) => r.eventId === "Traditional_Ladder")!;
    expect(trad.bo3Share).toBe(1);
  });

  it("respects minGames", () => {
    expect(
      queueSplits(
        [
          match({
            matchId: "1",
            endedAt: 1,
            result: "win",
            eventId: "Ladder",
          }),
        ],
        { minGames: 2 },
      ),
    ).toEqual([]);
  });
});
