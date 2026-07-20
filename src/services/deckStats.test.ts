import { describe, expect, it } from "vitest";
import { groupDecks, sortDecks } from "./deckStats";
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

describe("groupDecks", () => {
  it("groups by deck key and tracks first/last played", () => {
    const matches = [
      match({
        matchId: "2",
        endedAt: 2000,
        result: "win",
        deckName: "Izzet",
        deckHash: "h1",
      }),
      match({
        matchId: "1",
        endedAt: 1000,
        result: "loss",
        deckName: "Izzet",
        deckHash: "h1",
      }),
      match({
        matchId: "3",
        endedAt: 3000,
        result: "win",
        deckName: "Domain",
        deckHash: "h2",
      }),
    ];
    // deckKey prefers deckName when set.
    const groups = groupDecks(matches, { Domain: 1 });
    expect(groups).toHaveLength(2);
    const izzet = groups.find((g) => g.name === "Izzet")!;
    expect(izzet.matches).toHaveLength(2);
    expect(izzet.firstPlayedAt).toBe(1000);
    expect(izzet.lastPlayedAt).toBe(2000);
    expect(izzet.runActive).toBe(false);
    const domain = groups.find((g) => g.name === "Domain")!;
    expect(domain.runActive).toBe(true);
  });
});

describe("sortDecks", () => {
  it("sorts by match count descending by default intent", () => {
    const decks = groupDecks(
      [
        match({
          matchId: "a",
          endedAt: 1,
          result: "win",
          deckName: "A",
          deckHash: "a",
        }),
        match({
          matchId: "b1",
          endedAt: 2,
          result: "win",
          deckName: "B",
          deckHash: "b",
        }),
        match({
          matchId: "b2",
          endedAt: 3,
          result: "loss",
          deckName: "B",
          deckHash: "b",
        }),
      ],
      {},
    );
    const sorted = sortDecks(decks, "matches", "desc");
    expect(sorted[0].name).toBe("B");
    expect(sorted[1].name).toBe("A");
  });
});
