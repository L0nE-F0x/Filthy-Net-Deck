import { describe, expect, it } from "vitest";
import { buildLocalCoachChips } from "./localCoach";
import type { TrackedMatch } from "../types/tracker";

function match(
  partial: Partial<TrackedMatch> &
    Pick<TrackedMatch, "matchId" | "endedAt" | "result">,
): TrackedMatch {
  return {
    startedAt: partial.endedAt - 1000,
    eventId: "Ladder",
    bestOf: partial.bestOf ?? 1,
    myTeamId: 1,
    games: partial.games ?? [],
    ...partial,
  };
}

describe("buildLocalCoachChips", () => {
  it("returns empty when sample is thin", () => {
    expect(
      buildLocalCoachChips({
        matches: [match({ matchId: "1", endedAt: 1, result: "win" })],
        meta: null,
        resolveName: () => null,
      }),
    ).toEqual([]);
  });

  it("flags sideboard delta on enough Bo3 sample", () => {
    const matches: TrackedMatch[] = [];
    for (let i = 0; i < 6; i++) {
      matches.push(
        match({
          matchId: `b${i}`,
          endedAt: i + 1,
          result: "win",
          bestOf: 3,
          deckName: "Test",
          games: [
            { winningTeamId: 2 }, // g1 loss
            { winningTeamId: 1 }, // post win
            { winningTeamId: 1 },
          ],
        }),
      );
    }
    // pad with more decided for min 5
    for (let i = 0; i < 4; i++) {
      matches.push(
        match({
          matchId: `x${i}`,
          endedAt: 100 + i,
          result: "loss",
          deckName: "Test",
        }),
      );
    }
    const chips = buildLocalCoachChips({
      matches,
      meta: null,
      resolveName: () => null,
    });
    expect(chips.some((c) => c.id === "sideboard")).toBe(true);
  });
});
