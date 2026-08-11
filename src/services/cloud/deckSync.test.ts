import { describe, expect, it } from "vitest";
import {
  collectDeckRows,
  deckSyncFingerprint,
  indexByHash,
  toCloudDeck,
} from "./deckSync";
import type { TrackedMatch } from "../../types/tracker";

const USER = "11111111-1111-4111-8111-111111111111";

function match(over: Partial<TrackedMatch> = {}): TrackedMatch {
  return {
    matchId: "m1",
    startedAt: Date.UTC(2026, 7, 10, 12, 0, 0),
    endedAt: Date.UTC(2026, 7, 10, 12, 20, 0),
    eventId: "Ladder",
    bestOf: 1,
    myTeamId: 1,
    opponentName: "SomeOpponent#12345",
    myPlayerName: "Me#00001",
    opponentSeen: [101, 202, 303],
    opponentBasics: ["Swamp"],
    deckName: "My Brew",
    deckHash: "abc123",
    deckMain: [1, 1, 2, 3],
    deckSide: [9],
    games: [{ winningTeamId: 1, onPlay: true }],
    result: "win",
    ...over,
  };
}

const ctx = { formatFor: () => "standard" as const };

describe("collectDeckRows", () => {
  it("sends exactly the allowlisted columns", () => {
    const [row] = collectDeckRows(USER, [match()], ctx);
    expect(Object.keys(row).sort()).toEqual(
      ["deck_hash", "format", "main", "name", "played_at", "side", "user_id"].sort(),
    );
  });

  it("carries nothing about the opponent, and no Arena match id", () => {
    const s = JSON.stringify(collectDeckRows(USER, [match()], ctx));
    expect(s).not.toContain("SomeOpponent");
    expect(s).not.toContain("Me#00001");
    expect(s).not.toContain("Swamp");
    expect(s).not.toContain("m1");
    expect(s).not.toContain("101"); // opponentSeen grpIds
  });

  it("collapses every match on a list into one row", () => {
    const rows = collectDeckRows(
      USER,
      [match({ matchId: "a" }), match({ matchId: "b" }), match({ matchId: "c" })],
      ctx,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].main).toEqual([1, 1, 2, 3]);
  });

  it("takes the name from the freshest match, so a rename syncs", () => {
    const rows = collectDeckRows(
      USER,
      [
        match({ deckName: "Old Name", endedAt: 1_000 }),
        match({ deckName: "New Name", endedAt: 9_000 }),
      ],
      ctx,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("New Name");
    expect(rows[0].played_at).toBe(new Date(9_000).toISOString());
  });

  it("keeps distinct lists apart, newest first", () => {
    const rows = collectDeckRows(
      USER,
      [
        match({ deckHash: "old", deckName: "A", endedAt: 1_000 }),
        match({ deckHash: "new", deckName: "B", endedAt: 9_000 }),
      ],
      ctx,
    );
    expect(rows.map((r) => r.deck_hash)).toEqual(["new", "old"]);
  });

  it("skips matches with no registered list rather than uploading an empty deck", () => {
    // Only game 1 registers a list, so plenty of matches have no deckMain. A
    // row claiming a 0-card deck would be worse than no row at all.
    expect(collectDeckRows(USER, [match({ deckMain: undefined })], ctx)).toEqual([]);
    expect(collectDeckRows(USER, [match({ deckMain: [] })], ctx)).toEqual([]);
  });

  it("skips matches with no hash — there would be nothing to key on", () => {
    expect(collectDeckRows(USER, [match({ deckHash: undefined })], ctx)).toEqual([]);
  });

  it("only syncs the two formats the table accepts", () => {
    expect(
      collectDeckRows(USER, [match()], { formatFor: () => "alchemy" }),
    ).toEqual([]);
    expect(collectDeckRows(USER, [match()], { formatFor: () => null })).toEqual([]);
    expect(
      collectDeckRows(USER, [match()], { formatFor: () => "pioneer" })[0].format,
    ).toBe("pioneer");
  });

  it("prefers a recognised archetype over the user's own deck name", () => {
    const rows = collectDeckRows(USER, [match()], {
      ...ctx,
      decks: [{ id: "abc123", archetype: "Azorius Control", name: "x" }] as never,
    });
    expect(rows[0].name).toBe("Azorius Control");
  });
});

describe("deckSyncFingerprint", () => {
  it("is stable across row order", () => {
    const a = collectDeckRows(
      USER,
      [match({ deckHash: "x", endedAt: 2 }), match({ deckHash: "y", endedAt: 1 })],
      ctx,
    );
    expect(deckSyncFingerprint(a)).toBe(deckSyncFingerprint([...a].reverse()));
  });

  it("changes on a rename, which no high-water mark would catch", () => {
    const before = collectDeckRows(USER, [match({ deckName: "A" })], ctx);
    const after = collectDeckRows(USER, [match({ deckName: "B" })], ctx);
    expect(deckSyncFingerprint(before)).not.toBe(deckSyncFingerprint(after));
  });

  it("changes when the list itself changes", () => {
    const before = collectDeckRows(USER, [match()], ctx);
    const after = collectDeckRows(USER, [match({ deckMain: [1, 2] })], ctx);
    expect(deckSyncFingerprint(before)).not.toBe(deckSyncFingerprint(after));
  });
});

describe("toCloudDeck", () => {
  it("parses a server row", () => {
    const d = toCloudDeck({
      deck_hash: "abc",
      name: "Deck",
      format: "standard",
      main: [1, 2],
      side: [3],
      played_at: "2026-08-10T12:00:00.000Z",
    });
    expect(d).toEqual({
      deckHash: "abc",
      name: "Deck",
      format: "standard",
      main: [1, 2],
      side: [3],
      playedAt: Date.UTC(2026, 7, 10, 12, 0, 0),
    });
  });

  it("drops rows that cannot be used instead of half-restoring them", () => {
    expect(toCloudDeck(null)).toBeNull();
    expect(toCloudDeck({ name: "no hash", main: [1] })).toBeNull();
    expect(toCloudDeck({ deck_hash: "a", main: [] })).toBeNull();
    expect(toCloudDeck({ deck_hash: "a", main: "not an array" })).toBeNull();
  });

  it("tolerates a missing side and an unparseable date", () => {
    const d = toCloudDeck({ deck_hash: "a", main: [1], played_at: "nope" })!;
    expect(d.side).toEqual([]);
    expect(d.playedAt).toBeNull();
  });
});

describe("indexByHash", () => {
  it("keys restored lists for local lookup", () => {
    const map = indexByHash([
      { deckHash: "a", name: "A", format: "standard", main: [1], side: [], playedAt: null },
    ]);
    expect(map.get("a")?.main).toEqual([1]);
    expect(map.has("b")).toBe(false);
  });
});
