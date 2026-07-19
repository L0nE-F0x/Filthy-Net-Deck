import { describe, expect, it } from "vitest";
import { detectRankUp } from "./rankMoments";
import type { TrackedMatch } from "../types/tracker";

function m(partial: Partial<TrackedMatch> & { matchId: string }): TrackedMatch {
  return {
    matchId: partial.matchId,
    startedAt: partial.startedAt ?? 1,
    endedAt: partial.endedAt ?? 2,
    eventId: partial.eventId ?? "Ladder",
    bestOf: partial.bestOf ?? 1,
    myTeamId: partial.myTeamId ?? 1,
    games: partial.games ?? [],
    result: partial.result ?? "win",
    myRank: partial.myRank,
  };
}

describe("detectRankUp", () => {
  it("returns null without a new rank stamp", () => {
    expect(detectRankUp(m({ matchId: "a" }), [m({ matchId: "b", myRank: "Gold 2" })])).toBeNull();
  });

  it("returns null when history has no ranks (first stamp)", () => {
    expect(detectRankUp(m({ matchId: "a", myRank: "Gold 3" }), [])).toBeNull();
  });

  it("fires when climbing a division", () => {
    const prior = [m({ matchId: "1", myRank: "Platinum 3" })];
    const next = m({ matchId: "2", myRank: "Platinum 2" });
    const hit = detectRankUp(next, prior);
    expect(hit).not.toBeNull();
    expect(hit!.from).toBe("Platinum 3");
    expect(hit!.to).toBe("Platinum 2");
    expect(hit!.toScore).toBeGreaterThan(hit!.fromScore);
  });

  it("ignores flat or down ranks", () => {
    const prior = [m({ matchId: "1", myRank: "Diamond 2" })];
    expect(detectRankUp(m({ matchId: "2", myRank: "Diamond 2" }), prior)).toBeNull();
    expect(detectRankUp(m({ matchId: "3", myRank: "Diamond 3" }), prior)).toBeNull();
  });

  it("compares against best prior, not only last match", () => {
    const prior = [
      m({ matchId: "1", myRank: "Gold 1" }),
      m({ matchId: "2", myRank: "Platinum 4" }),
      m({ matchId: "3", myRank: "Gold 2" }), // dip
    ];
    // Gold 1 is not a climb past Platinum 4
    expect(detectRankUp(m({ matchId: "4", myRank: "Gold 1" }), prior)).toBeNull();
    const up = detectRankUp(m({ matchId: "5", myRank: "Platinum 3" }), prior);
    expect(up?.to).toBe("Platinum 3");
    expect(up?.from).toBe("Platinum 4");
  });
});
