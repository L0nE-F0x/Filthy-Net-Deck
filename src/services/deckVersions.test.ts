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

  it("fills a missing list from the cloud backup, and says so", () => {
    // History survived (it is persisted) but the log that carried the list has
    // rotated — the exact gap cloud deck sync exists to close.
    const vs = buildVersions(
      [m({ deckHash: "h1" })],
      new Map([["h1", { main: [1, 1, 2], side: [9] }]]),
    );
    expect(vs[0].main).toEqual([1, 1, 2]);
    expect(vs[0].side).toEqual([9]);
    expect(vs[0].fromCloud).toBe(true);
  });

  it("never lets a backup override a list the log actually recorded", () => {
    const vs = buildVersions(
      [m({ deckHash: "h1", deckMain: [7] })],
      new Map([["h1", { main: [1, 2, 3] }]]),
    );
    expect(vs[0].main).toEqual([7]);
    expect(vs[0].fromCloud).toBe(false);
  });

  it("leaves a version alone when the backup has nothing for it", () => {
    const vs = buildVersions([m({ deckHash: "h1" })], new Map());
    expect(vs[0].main).toBeUndefined();
    expect(vs[0].fromCloud).toBeUndefined();
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
