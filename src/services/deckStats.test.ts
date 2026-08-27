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

  it("files each deck under the format of its newest match", () => {
    // A list carried out of Standard after rotation is a Historic deck now,
    // and the library should say where it is legal today.
    const groups = groupDecks(
      [
        match({
          matchId: "new",
          endedAt: 3000,
          result: "win",
          deckName: "Izzet",
          eventId: "Historic_Ladder",
        }),
        match({
          matchId: "old",
          endedAt: 1000,
          result: "win",
          deckName: "Izzet",
          eventId: "Ladder",
        }),
      ],
      {},
    );
    expect(groups[0].format).toBe("historic");
  });

  it("ignores a match Arena never named rather than blanking the format", () => {
    // Arena does not always hand over an event id. One such match arriving
    // last must not erase a format every other match on the deck agrees on.
    const groups = groupDecks(
      [
        match({
          matchId: "unnamed",
          endedAt: 4000,
          result: "win",
          deckName: "Izzet",
          eventId: "Unknown",
        }),
        match({
          matchId: "named",
          endedAt: 2000,
          result: "win",
          deckName: "Izzet",
          eventId: "Explorer_Ladder",
        }),
      ],
      {},
    );
    expect(groups[0].format).toBe("pioneer");
    expect(groups[0].lastPlayedAt).toBe(4000);
  });

  it("says unknown when nothing named a queue", () => {
    const groups = groupDecks(
      [match({ matchId: "a", endedAt: 1, result: "win", eventId: "Unknown" })],
      {},
    );
    expect(groups[0].format).toBe("unknown");
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
