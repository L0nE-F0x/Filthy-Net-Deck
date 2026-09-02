import { describe, expect, it } from "vitest";
import {
  backupId,
  backupIdsFor,
  filterRestored,
  fromBackupRow,
  mergeRestored,
  pendingBackup,
  restoredCount,
  toBackupRow,
} from "./backupSync";
import { groupDecks } from "../deckStats";
import { tallyMatches } from "../statsHelpers";
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
    opponentPlatform: "Windows",
    myPlayerName: "Me#00001",
    opponentSeen: [101, 202, 303],
    opponentBasics: ["Island", "Swamp"],
    deckName: "My Brew",
    deckId: "deck-9",
    deckHash: "abc123",
    myRank: "Diamond 2",
    seasonOrdinal: 7,
    deckMain: [1, 1, 2],
    deckSide: [3],
    games: [{ winningTeamId: 1, onPlay: true, mulligans: 1, firstLandTurn: 2 }],
    result: "win",
    resultReason: "Concede",
    ...over,
  };
}

/** The row as the uploader builds it, with the digest the server keys on. */
async function row(m: TrackedMatch = match()) {
  return toBackupRow(USER, m, await backupId(USER, m.matchId));
}

/** A match as a second machine sees it: round-tripped through the backup. */
async function restoredCopy(m: TrackedMatch = match()) {
  return fromBackupRow((await row(m))!)!;
}

describe("backupId", () => {
  it("is a salted digest, never Arena's own id", async () => {
    const id = await backupId(USER, "m1");
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    expect(id).not.toContain("m1");
  });

  it("is stable for a user, and differs between users", async () => {
    expect(await backupId(USER, "m1")).toBe(await backupId(USER, "m1"));
    expect(await backupId(USER, "m1")).not.toBe(
      await backupId("22222222-2222-4222-8222-222222222222", "m1"),
    );
  });

  it("maps a batch back to the raw ids it came from", async () => {
    const ids = await backupIdsFor(USER, [match({ matchId: "a" }), match({ matchId: "b" })]);
    expect([...ids.keys()].sort()).toEqual(["a", "b"]);
    expect(ids.get("a")).toBe(await backupId(USER, "a"));
  });
});

describe("toBackupRow", () => {
  it("sends exactly the allowlisted columns", async () => {
    expect(Object.keys((await row())!).sort()).toEqual(
      [
        "best_of", "deck_hash", "deck_id", "deck_main", "deck_name", "deck_side",
        "ended_at", "event_id", "games", "match_id", "my_rank", "my_team_id",
        "result", "result_reason", "season_ordinal", "started_at", "user_id",
      ].sort(),
    );
  });

  it("never carries the opponent's identity, even into a private table", async () => {
    // The whole reason this table exists is that it can be more complete than
    // shared_matches. This test is what stops "more complete" from quietly
    // becoming "includes the other player".
    const s = JSON.stringify(await row());
    expect(s).not.toContain("SomeOpponent");
    expect(s).not.toContain("101"); // opponentSeen grpIds
    expect(s).not.toContain("Island"); // opponentBasics
    expect(s).not.toContain("Windows"); // opponentPlatform
  });

  it("does not upload the local player name, which nothing reads", async () => {
    expect(JSON.stringify(await row())).not.toContain("Me#00001");
  });

  it("does not upload Arena's raw match id", async () => {
    // privacy.html §3 lists this under "never uploaded, under ANY setting".
    // A private table gets no exemption from an unconditional claim.
    const built = (await row(match({ matchId: "arena-match-guid-42" })))!;
    expect(JSON.stringify(built)).not.toContain("arena-match-guid-42");
    expect(built.match_id).toBe(await backupId(USER, "arena-match-guid-42"));
  });

  it("keeps the queue that shared_matches throws away", async () => {
    expect((await row(match({ eventId: "Brawl_Ladder" })))!.event_id).toBe("Brawl_Ladder");
  });

  it("backs up formats the crowd rollup refuses", async () => {
    // buildSharedMatch returns null for all of these. A personal backup that
    // dropped them would lose most of a casual player's history.
    for (const eventId of ["Brawl_Ladder", "QuickDraft_DMU", "Historic_Ladder", "Play"]) {
      expect(await row(match({ eventId }))).not.toBeNull();
    }
  });

  it("keeps an unfinished match rather than pretending it never happened", async () => {
    expect((await row(match({ result: "unknown" })))!.result).toBe("unknown");
  });

  it("keeps a match with no deck and no rank", async () => {
    const built = (await row(
      match({ deckName: undefined, deckHash: undefined, myRank: undefined }),
    ))!;
    expect(built.deck_name).toBeNull();
    expect(built.deck_hash).toBeNull();
    expect(built.my_rank).toBeNull();
  });

  it("carries the full per-game detail, not just win/loss", async () => {
    expect((await row())!.games).toEqual([
      { winningTeamId: 1, reason: undefined, onPlay: true, mulligans: 1, firstLandTurn: 2 },
    ]);
  });

  it("emits ISO timestamps the server will accept", async () => {
    const built = (await row())!;
    expect(built.started_at).toBe("2026-08-10T12:00:00.000Z");
    expect(built.ended_at).toBe("2026-08-10T12:20:00.000Z");
  });

  it("rejects only what has no identity or no usable time", async () => {
    expect(toBackupRow(USER, match(), "")).toBeNull();
    expect(await row(match({ matchId: "" }))).toBeNull();
    expect(await row(match({ startedAt: 0, endedAt: 0 }))).toBeNull();
    expect(await row(match({ startedAt: NaN, endedAt: NaN }))).toBeNull();
  });

  it("falls back to startedAt when a match never recorded an end", async () => {
    const built = (await row(match({ endedAt: 0 })))!;
    expect(built.ended_at).toBe(built.started_at);
  });
});

describe("fromBackupRow", () => {
  it("round-trips everything the backup stores", async () => {
    const original = match();
    expect(await restoredCopy(original)).toEqual({
      matchId: await backupId(USER, "m1"),
      startedAt: original.startedAt,
      endedAt: original.endedAt,
      eventId: "Ladder",
      bestOf: 1,
      myTeamId: 1,
      games: [{ winningTeamId: 1, reason: undefined, onPlay: true, mulligans: 1, firstLandTurn: 2 }],
      result: "win",
      resultReason: "Concede",
      deckName: "My Brew",
      deckId: "deck-9",
      deckHash: "abc123",
      myRank: "Diamond 2",
      seasonOrdinal: 7,
      deckMain: [1, 1, 2],
      deckSide: [3],
    });
  });

  it("leaves the opponent fields absent, the way a pre-v3 match looks", async () => {
    const restored = await restoredCopy();
    expect(restored.opponentName).toBeUndefined();
    expect(restored.opponentSeen).toBeUndefined();
    expect(restored.opponentBasics).toBeUndefined();
  });

  it("keeps myTeamId so per-game wins still resolve", async () => {
    // Restoring this as 0 would silently turn every won game into a loss.
    const restored = await restoredCopy(match({ myTeamId: 2 }));
    expect(restored.myTeamId).toBe(2);
    expect(restored.games[0].winningTeamId === restored.myTeamId).toBe(false);
  });

  it("survives junk in the jsonb columns", () => {
    const restored = fromBackupRow({
      match_id: "m9",
      started_at: "2026-08-10T12:00:00.000Z",
      ended_at: "2026-08-10T12:10:00.000Z",
      event_id: "Ladder",
      best_of: 1,
      my_team_id: 1,
      games: "not-an-array",
      result: "nonsense",
      deck_main: [1, "x", null, 2],
      deck_side: null,
    })!;
    expect(restored.games).toEqual([]);
    expect(restored.result).toBe("unknown");
    expect(restored.deckMain).toEqual([1, 2]);
    expect(restored.deckSide).toBeUndefined();
  });

  it("drops a row with no id or no start time", () => {
    expect(fromBackupRow({ match_id: "", started_at: "2026-08-10T12:00:00Z" })).toBeNull();
    expect(fromBackupRow({ match_id: "m1", started_at: null })).toBeNull();
    expect(fromBackupRow({ match_id: "m1", started_at: "not a date" })).toBeNull();
  });
});

describe("pendingBackup", () => {
  it("returns only what the cloud has not seen", async () => {
    const local = [match({ matchId: "a" }), match({ matchId: "b" }), match({ matchId: "c" })];
    const ids = await backupIdsFor(USER, local);
    const pending = pendingBackup(local, ids, new Set([ids.get("b")!]));
    expect(pending.map((m) => m.matchId)).toEqual(["a", "c"]);
  });

  it("is empty once everything is backed up", async () => {
    const local = [match({ matchId: "a" })];
    const ids = await backupIdsFor(USER, local);
    expect(pendingBackup(local, ids, new Set(ids.values()))).toEqual([]);
  });
});

describe("filterRestored", () => {
  it("drops the machine's own backup so history cannot double itself", async () => {
    // Every machine restores what it just uploaded. This is the guard.
    const local = [match({ matchId: "a" }), match({ matchId: "b" })];
    const ids = await backupIdsFor(USER, local);
    const fromCloud = await Promise.all(local.map((m) => restoredCopy(m)));

    expect(filterRestored(fromCloud, new Set(ids.values()))).toEqual([]);
  });

  it("keeps matches this machine has never played", async () => {
    const localIds = await backupIdsFor(USER, [match({ matchId: "mine" })]);
    const fromCloud = [await restoredCopy(match({ matchId: "theirs" }))];

    expect(filterRestored(fromCloud, new Set(localIds.values()))).toHaveLength(1);
  });

  it("never resurrects a match the user deleted", async () => {
    const deleted = await restoredCopy(match({ matchId: "gone" }));
    expect(
      filterRestored([deleted], new Set(), new Set([deleted.matchId])),
    ).toEqual([]);
  });
});

describe("mergeRestored", () => {
  const local = [
    match({ matchId: "local-new", startedAt: 300 }),
    match({ matchId: "local-old", startedAt: 100 }),
  ];

  it("adds cloud matches this machine has never seen", () => {
    const merged = mergeRestored(local, [match({ matchId: "cloud", startedAt: 200 })]);
    expect(merged.map((m) => m.matchId)).toEqual(["local-new", "cloud", "local-old"]);
  });

  it("prefers the local copy, which still has the opponent data", () => {
    const merged = mergeRestored(local, [match({ matchId: "local-new", startedAt: 300 })]);
    expect(merged).toHaveLength(2);
    expect(merged.find((m) => m.matchId === "local-new")?.opponentName).toBe(
      "SomeOpponent#12345",
    );
  });

  it("sorts newest first, matching what tracker_matches returns", () => {
    const merged = mergeRestored(local, [
      match({ matchId: "c1", startedAt: 50 }),
      match({ matchId: "c2", startedAt: 400 }),
    ]);
    expect(merged.map((m) => m.startedAt)).toEqual([400, 300, 100, 50]);
  });

  it("is a no-op with nothing to restore", () => {
    expect(mergeRestored(local, [])).toEqual(local);
    expect(mergeRestored([], [])).toEqual([]);
  });

  it("restores the whole account onto a machine with no local history", () => {
    // The reported bug: a fresh install showed an empty Stats page.
    const cloud = [match({ matchId: "a", startedAt: 1 }), match({ matchId: "b", startedAt: 2 })];
    const merged = mergeRestored([], cloud);
    expect(merged).toHaveLength(2);
    expect(restoredCount([], merged)).toBe(2);
  });
});

describe("the second machine, end to end", () => {
  // The other half of the same bug report: the deck library was empty too.
  // Decks are not stored as decks — they are match history collapsed by key —
  // so they come back only if the restored matches carry enough to group and
  // tally. This asserts that they do, through the real aggregation.
  it("rebuilds the deck library and its winrates from restored matches alone", async () => {
    const played = [
      match({ matchId: "a", deckId: "deck-9", deckName: "My Brew", result: "win", eventId: "Ladder" }),
      match({ matchId: "b", deckId: "deck-9", deckName: "My Brew", result: "loss", eventId: "Ladder" }),
      match({ matchId: "c", deckId: "deck-7", deckName: "Brawl Pile", result: "win", eventId: "Brawl_Ladder" }),
    ];

    // Round-trip every match through the backup, the way a second machine sees
    // them, then group with nothing local at all.
    const restored = await Promise.all(played.map((m) => restoredCopy(m)));
    const decks = groupDecks(mergeRestored([], restored), {});

    expect(decks).toHaveLength(2);
    const brew = decks.find((d) => d.key === "deck-9")!;
    expect(brew.name).toBe("My Brew");
    expect(brew.format).toBe("standard");
    expect(tallyMatches(brew.matches)).toEqual({
      wins: 1,
      losses: 1,
      decided: 2,
      rate: 0.5,
    });

    // And the queue survives, so a Brawl deck is not filed as Standard — the
    // thing restoring from `shared_matches` could never have got right.
    expect(decks.find((d) => d.key === "deck-7")!.format).toBe("brawl");
  });

  it("keeps the registered decklist, so a rotated log is not the end of it", async () => {
    const restored = await restoredCopy();
    expect(restored.deckMain).toEqual([1, 1, 2]);
    expect(restored.deckSide).toEqual([3]);
  });
});
