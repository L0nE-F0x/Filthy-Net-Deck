import { describe, expect, it } from "vitest";
import { groupOpponents, sortOppGroups } from "./matchupGroups";
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

describe("groupOpponents", () => {
  it("groups by opponent and builds form", () => {
    const groups = groupOpponents(
      [
        match({
          matchId: "1",
          endedAt: 100,
          result: "win",
          opponentName: "Alice",
          deckName: "Izzet",
        }),
        match({
          matchId: "2",
          endedAt: 200,
          result: "loss",
          opponentName: "Alice",
          deckName: "Izzet",
        }),
        match({
          matchId: "3",
          endedAt: 300,
          result: "win",
          opponentName: "Bob",
        }),
      ],
      { alice: { tag: "Izzet", notes: "bolt" } },
    );
    expect(groups).toHaveLength(2);
    const alice = groups.find((g) => g.name === "Alice")!;
    expect(alice.wins).toBe(1);
    expect(alice.losses).toBe(1);
    expect(alice.form).toBe("WL");
    expect(alice.tag).toBe("Izzet");
    expect(alice.notes).toBe("bolt");
  });
});

describe("sortOppGroups", () => {
  it("sorts by losses desc", () => {
    const groups = groupOpponents(
      [
        match({
          matchId: "1",
          endedAt: 1,
          result: "loss",
          opponentName: "A",
        }),
        match({
          matchId: "2",
          endedAt: 2,
          result: "loss",
          opponentName: "A",
        }),
        match({
          matchId: "3",
          endedAt: 3,
          result: "win",
          opponentName: "B",
        }),
      ],
      {},
    );
    const sorted = sortOppGroups(groups, "losses");
    expect(sorted[0].name).toBe("A");
    expect(sorted[0].losses).toBe(2);
  });
});
