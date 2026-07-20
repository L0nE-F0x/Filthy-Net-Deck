import { describe, expect, it } from "vitest";
import type { TrackedMatch } from "../types/tracker";
import {
  buildVersions,
  diffLists,
  latestDecklist,
  latestMainboard,
} from "./deckVersions";

function m(over: Partial<TrackedMatch>): TrackedMatch {
  return {
    matchId: over.matchId ?? "x",
    startedAt: over.startedAt ?? 1,
    endedAt: over.endedAt ?? 2,
    eventId: "Ladder",
    bestOf: 1,
    myTeamId: 1,
    games: [],
    result: "win",
    ...over,
  };
}

describe("buildVersions", () => {
  it("groups by deckHash in first-seen order", () => {
    const vs = buildVersions([
      m({
        matchId: "a",
        startedAt: 10,
        endedAt: 11,
        deckHash: "h1",
        deckMain: [1, 1, 2],
      }),
      m({
        matchId: "b",
        startedAt: 20,
        endedAt: 21,
        deckHash: "h2",
        deckMain: [3],
      }),
      m({
        matchId: "c",
        startedAt: 15,
        endedAt: 16,
        deckHash: "h1",
        deckMain: [1, 1, 2],
      }),
    ]);
    expect(vs.map((v) => v.hash)).toEqual(["h1", "h2"]);
    expect(vs[0].matches).toHaveLength(2);
    expect(vs[0].firstAt).toBe(10);
    expect(vs[0].lastAt).toBe(16);
  });

  it("skips matches without a hash", () => {
    expect(buildVersions([m({ deckMain: [1] })])).toEqual([]);
  });
});

describe("diffLists", () => {
  it("reports multiset adds and cuts", () => {
    const d = diffLists([1, 1, 2], [1, 3, 3]);
    expect(d).toEqual([
      { id: 3, delta: 2 },
      { id: 1, delta: -1 },
      { id: 2, delta: -1 },
    ]);
  });
});

describe("latest*", () => {
  it("returns first match with a list (caller passes newest-first)", () => {
    const list = [
      m({ deckMain: [9], deckSide: [8] }),
      m({ deckMain: [1, 2] }),
    ];
    expect(latestMainboard(list)).toEqual([9]);
    expect(latestDecklist(list)).toEqual({ main: [9], side: [8] });
  });
});
