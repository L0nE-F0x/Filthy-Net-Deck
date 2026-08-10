import { describe, expect, it } from "vitest";
import { buildSharedMatch, chunk, UPLOAD_CHUNK } from "./matchSync";
import { archetypeSlug, labelFromSlug } from "./archetypeSlug";
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
    deckName: "My Brew",
    deckHash: "abc123",
    myRank: "Diamond 2",
    seasonOrdinal: 7,
    games: [{ winningTeamId: 1, onPlay: true }],
    result: "win",
    ...over,
  };
}

const ctx = {
  formatId: "standard" as const,
  myArchetypeName: "Azorius Control",
  oppArchetypeName: "Mono-Red Aggro",
  oppConfidence: 0.9,
};

describe("archetypeSlug", () => {
  it("collapses casing, spacing and punctuation to one key", () => {
    expect(archetypeSlug("standard", "Azorius Control")).toBe("standard-azorius-control");
    expect(archetypeSlug("standard", "azorius   control")).toBe("standard-azorius-control");
    expect(archetypeSlug("standard", "Azorius-Control!")).toBe("standard-azorius-control");
  });

  it("strips accents so the same deck does not split into two cells", () => {
    expect(archetypeSlug("standard", "Jeskai Ètude")).toBe("standard-jeskai-etude");
  });

  it("namespaces by format — same name, different deck", () => {
    expect(archetypeSlug("pioneer", "Azorius Control")).toBe("pioneer-azorius-control");
  });

  it("rejects unusable input rather than inventing a bucket", () => {
    expect(archetypeSlug("alchemy", "Whatever")).toBeNull();
    expect(archetypeSlug("standard", "")).toBeNull();
    expect(archetypeSlug("standard", "!!!")).toBeNull();
    expect(archetypeSlug(null, "Azorius Control")).toBeNull();
  });

  it("round-trips to a readable label", () => {
    expect(labelFromSlug("standard-azorius-control")).toBe("Azorius Control");
  });
});

describe("buildSharedMatch", () => {
  it("sends exactly the allowlisted columns", () => {
    const row = buildSharedMatch(USER, match(), ctx, "hash")!;
    expect(Object.keys(row).sort()).toEqual(
      [
        "best_of", "client_hash", "ended_at", "format", "games", "my_archetype",
        "my_deck_hash", "opp_archetype", "opp_confidence", "rank", "ranked",
        "result", "season_ordinal", "started_at", "user_id",
      ].sort(),
    );
  });

  it("never carries the opponent's identity or the local player name", () => {
    const s = JSON.stringify(buildSharedMatch(USER, match(), ctx, "hash"));
    expect(s).not.toContain("SomeOpponent");
    expect(s).not.toContain("Me#00001");
    expect(s).not.toContain("101"); // opponentSeen grpIds
    expect(s).not.toContain("My Brew"); // raw deck name
    expect(s).not.toContain("m1"); // raw Arena match id
  });

  it("derives per-game wins from the local team id", () => {
    const row = buildSharedMatch(
      USER,
      match({ games: [{ winningTeamId: 1 }, { winningTeamId: 2 }], bestOf: 3 }),
      ctx,
      "h",
    )!;
    expect(row.games.map((g) => g.won)).toEqual([true, false]);
    expect(row.best_of).toBe(3);
  });

  it("marks ladder queues as ranked", () => {
    expect(buildSharedMatch(USER, match(), ctx, "h")!.ranked).toBe(true);
    expect(
      buildSharedMatch(USER, match({ eventId: "Play" }), ctx, "h")!.ranked,
    ).toBe(false);
  });

  it("keeps a match whose opponent could not be identified", () => {
    const row = buildSharedMatch(
      USER,
      match(),
      { ...ctx, oppArchetypeName: null, oppConfidence: null },
      "h",
    )!;
    expect(row.opp_archetype).toBeNull();
    expect(row.my_archetype).toBe("standard-azorius-control");
  });

  it("drops matches that cannot be aggregated", () => {
    expect(buildSharedMatch(USER, match({ result: "unknown" }), ctx, "h")).toBeNull();
    expect(
      buildSharedMatch(USER, match(), { ...ctx, myArchetypeName: null }, "h"),
    ).toBeNull();
    expect(
      buildSharedMatch(USER, match(), { ...ctx, formatId: null }, "h"),
    ).toBeNull();
  });

  it("emits ISO timestamps the server will accept", () => {
    const row = buildSharedMatch(USER, match(), ctx, "h")!;
    expect(row.started_at).toBe("2026-08-10T12:00:00.000Z");
    expect(row.ended_at).toBe("2026-08-10T12:20:00.000Z");
  });
});

describe("chunk", () => {
  it("splits a backlog so one bad row cannot fail everything", () => {
    const items = Array.from({ length: 120 }, (_, i) => i);
    const parts = chunk(items);
    expect(parts).toHaveLength(3);
    expect(parts[0]).toHaveLength(UPLOAD_CHUNK);
    expect(parts.flat()).toEqual(items);
  });

  it("handles empty and small inputs", () => {
    expect(chunk([])).toEqual([]);
    expect(chunk([1, 2])).toEqual([[1, 2]]);
  });
});
