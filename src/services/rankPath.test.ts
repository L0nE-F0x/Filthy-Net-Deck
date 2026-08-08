import { describe, expect, it } from "vitest";
import { applyWithinRankMomentum, buildRankPath } from "./rankPath";
import type { TrackedMatch } from "../types/tracker";

const NOW = Date.UTC(2026, 6, 28, 20, 0, 0);
const MIN = 60_000;
const HOUR = 3_600_000;

/** `agoMin` minutes before NOW, so session windows behave like real play. */
function m(
  partial: Partial<TrackedMatch> & { matchId: string; agoMin: number },
): TrackedMatch {
  const endedAt = NOW - partial.agoMin * MIN;
  return {
    matchId: partial.matchId,
    startedAt: endedAt - 8 * MIN,
    endedAt,
    eventId: partial.eventId ?? "Ladder",
    bestOf: partial.bestOf ?? 1,
    myTeamId: 1,
    games: [],
    result: partial.result ?? "win",
    deckId: partial.deckId ?? "deck-a",
    myRank: partial.myRank,
    seasonOrdinal: partial.seasonOrdinal,
  };
}

const onDeckA = (x: TrackedMatch) => x.deckId === "deck-a";

describe("buildRankPath", () => {
  it("closes the path on the rank the just-played match earned", () => {
    // Real shape from Player.log: the stamp is the rank going in, and Arena
    // logs the earned one ~50 lines after the result (win 92.1% → 92.6%).
    const history = [
      m({ matchId: "a-0", agoMin: 30, myRank: "Mythic 91.5%" }),
      m({ matchId: "a-1", agoMin: 5, myRank: "Mythic 92.1%" }),
    ];
    const path = buildRankPath(history, {
      onDeck: onDeckA,
      nowMs: NOW,
      liveRank: "Mythic 92.6%",
      liveMatchId: "a-1",
    })!;
    expect(path.endsNow).toBe(true);
    expect(path.points).toHaveLength(3);
    const now = path.points[2];
    expect(now.score).toBeCloseTo(20.926);
    expect(now.matchId).toBeUndefined();
    expect(now.result).toBe("win");
  });

  it("draws one game as a before/after line once the rank lands", () => {
    const history = [m({ matchId: "only", agoMin: 3, myRank: "Mythic 92.1%" })];
    // Rank not logged yet — nothing honest to draw.
    expect(
      buildRankPath(history, { onDeck: onDeckA, nowMs: NOW }),
    ).toBeNull();
    // It lands mid-linger and the card gets its two points.
    const path = buildRankPath(history, {
      onDeck: onDeckA,
      nowMs: NOW,
      liveRank: "Mythic 92.6%",
      liveMatchId: "only",
    })!;
    expect(path.points).toHaveLength(2);
    expect(path.scope).toBe("session");
  });

  it("ignores a live rank belonging to some other match", () => {
    const history = [
      m({ matchId: "a-0", agoMin: 30, myRank: "Mythic 91.5%" }),
      m({ matchId: "a-1", agoMin: 5, myRank: "Mythic 92.1%" }),
    ];
    // Just played a Play-queue game on this deck: the constructed rank did not
    // move because of "a-1", so the path must not claim it did.
    const path = buildRankPath(history, {
      onDeck: onDeckA,
      nowMs: NOW,
      liveRank: "Mythic 92.6%",
      liveMatchId: "some-unranked-game",
    })!;
    expect(path.endsNow).toBe(false);
    expect(path.points).toHaveLength(2);
  });

  it("adds no point when the rank has not moved", () => {
    const history = [
      m({ matchId: "a-0", agoMin: 30, myRank: "Gold 4" }),
      m({ matchId: "a-1", agoMin: 5, myRank: "Gold 4" }),
    ];
    const path = buildRankPath(history, {
      onDeck: onDeckA,
      nowMs: NOW,
      liveRank: "Gold 4",
      liveMatchId: "a-1",
    })!;
    expect(path.points).toHaveLength(2);
    expect(path.endsNow).toBe(false);
  });

  it("draws nothing for a fresh deck with one game", () => {
    const history = [
      // A long session on a *different* deck — must not become this deck's path.
      ...Array.from({ length: 12 }, (_, i) =>
        m({
          matchId: `other-${i}`,
          agoMin: 200 - i * 15,
          deckId: "deck-b",
          myRank: `Mythic ${(91 + i * 0.1).toFixed(1)}%`,
        }),
      ),
      m({ matchId: "fresh", agoMin: 5, myRank: "Mythic 92.1%" }),
    ];
    expect(buildRankPath(history, { onDeck: onDeckA, nowMs: NOW })).toBeNull();
  });

  it("plots this deck's ladder games in the current session", () => {
    const history = Array.from({ length: 4 }, (_, i) =>
      m({
        matchId: `a-${i}`,
        agoMin: 60 - i * 15,
        myRank: `Mythic ${(91 + i * 0.2).toFixed(1)}%`,
        result: i === 1 ? "loss" : "win",
      }),
    );
    const path = buildRankPath(history, { onDeck: onDeckA, nowMs: NOW })!;
    expect(path.scope).toBe("session");
    expect(path.points.map((p) => p.matchId)).toEqual(["a-0", "a-1", "a-2", "a-3"]);
    expect(path.points[1].result).toBe("loss");
    expect(path.points[0].score).toBeCloseTo(20.91);
  });

  it("ignores draft and Play-queue matches carrying a constructed stamp", () => {
    const history = [
      m({ matchId: "l1", agoMin: 50, myRank: "Diamond 3" }),
      m({ matchId: "draft", agoMin: 40, eventId: "PremierDraft_TDM", myRank: "Diamond 3" }),
      m({ matchId: "play", agoMin: 30, eventId: "Play", myRank: "Diamond 3" }),
      m({ matchId: "l2", agoMin: 20, myRank: "Diamond 2" }),
    ];
    const path = buildRankPath(history, { onDeck: onDeckA, nowMs: NOW })!;
    expect(path.points.map((p) => p.matchId)).toEqual(["l1", "l2"]);
  });

  it("does not pin the path endpoint on an unranked finish", () => {
    // Ranked climb, then a Play-queue loss that stamps the same constructed rank
    // (and would look like a ladder dip if used as the "now" point).
    const history = [
      m({ matchId: "r1", agoMin: 40, myRank: "Mythic 92.0%", result: "win" }),
      m({ matchId: "r2", agoMin: 20, myRank: "Mythic 92.4%", result: "win" }),
      m({
        matchId: "play-loss",
        agoMin: 3,
        eventId: "Play",
        myRank: "Mythic 92.4%",
        result: "loss",
      }),
    ];
    const path = buildRankPath(history, {
      onDeck: onDeckA,
      nowMs: NOW,
      liveRank: "Mythic 92.4%",
      liveMatchId: "play-loss",
      liveEventId: "Play",
    })!;
    expect(path.points.map((p) => p.matchId)).toEqual(["r1", "r2"]);
    expect(path.endsNow).toBe(false);
    expect(path.points.every((p) => p.result !== "loss")).toBe(true);
  });

  it("never spans a season reset", () => {
    const history = [
      m({ matchId: "old1", agoMin: 200, myRank: "Mythic 95%", seasonOrdinal: 90 }),
      m({ matchId: "old2", agoMin: 190, myRank: "Mythic 96%", seasonOrdinal: 90 }),
      m({ matchId: "new1", agoMin: 60, myRank: "Bronze 4", seasonOrdinal: 91 }),
      m({ matchId: "new2", agoMin: 40, myRank: "Bronze 3", seasonOrdinal: 91 }),
    ];
    const path = buildRankPath(history, { onDeck: onDeckA, nowMs: NOW })!;
    expect(path.points.map((p) => p.matchId)).toEqual(["new1", "new2"]);
  });

  it("falls back to the season when the session has one ranked game", () => {
    const history = [
      m({ matchId: "old1", agoMin: 60 * 30, myRank: "Gold 4" }),
      m({ matchId: "old2", agoMin: 60 * 29, myRank: "Gold 3" }),
      m({ matchId: "now", agoMin: 5, myRank: "Gold 2" }),
    ];
    const path = buildRankPath(history, { onDeck: onDeckA, nowMs: NOW })!;
    expect(path.scope).toBe("season");
    expect(path.points).toHaveLength(3);
  });

  it("keeps only the most recent points", () => {
    const history = Array.from({ length: 20 }, (_, i) =>
      m({ matchId: `a-${i}`, agoMin: 20 * 15 - i * 15, myRank: "Gold 4" }),
    );
    const path = buildRankPath(history, {
      onDeck: onDeckA,
      nowMs: NOW,
      maxPoints: 12,
    })!;
    expect(path.points).toHaveLength(12);
    expect(path.points[11].matchId).toBe("a-19");
  });

  it("returns null when no match carries a rank stamp", () => {
    const history = [
      m({ matchId: "a", agoMin: 30 }),
      m({ matchId: "b", agoMin: 20 }),
    ];
    expect(buildRankPath(history, { onDeck: onDeckA, nowMs: NOW })).toBeNull();
  });

  it("treats a 3h+ gap as a new session", () => {
    const history = [
      m({ matchId: "earlier1", agoMin: 12 * 60, myRank: "Gold 4" }),
      m({ matchId: "earlier2", agoMin: 11 * 60, myRank: "Gold 3" }),
      m({ matchId: "tonight1", agoMin: 40, myRank: "Gold 2" }),
      m({ matchId: "tonight2", agoMin: 20, myRank: "Gold 1" }),
    ];
    const path = buildRankPath(history, { onDeck: onDeckA, nowMs: NOW })!;
    expect(path.scope).toBe("session");
    expect(path.points.map((p) => p.matchId)).toEqual(["tonight1", "tonight2"]);
    // Sanity: the gap really is over the 3h session threshold.
    expect(history[2].endedAt - history[1].endedAt).toBeGreaterThan(3 * HOUR);
  });

  it("wiggles within a single division so the sparkline is not a flat line", () => {
    // Gold 4 for four games: W-W-L-W. Without momentum every point is 8.0 and
    // the post-match graph reads as a dead horizontal line.
    const history = [
      m({ matchId: "g0", agoMin: 60, myRank: "Gold 4", result: "win" }),
      m({ matchId: "g1", agoMin: 45, myRank: "Gold 4", result: "win" }),
      m({ matchId: "g2", agoMin: 30, myRank: "Gold 4", result: "loss" }),
      m({ matchId: "g3", agoMin: 5, myRank: "Gold 4", result: "win" }),
    ];
    const path = buildRankPath(history, { onDeck: onDeckA, nowMs: NOW })!;
    const scores = path.points.map((p) => p.score);
    expect(Math.max(...scores) - Math.min(...scores)).toBeGreaterThan(0.2);
    // Never claims a full division promote from pip momentum alone.
    expect(Math.floor(Math.max(...scores))).toBe(8); // Gold 4 floor
    expect(scores[0]).toBeLessThan(scores[1]); // first win lifts the next sit-down
    expect(scores[1]).toBeLessThan(scores[2]); // second win climbs further
    expect(scores[3]).toBeLessThan(scores[2]); // loss pulls the following point back
  });
});

describe("applyWithinRankMomentum", () => {
  it("leaves Mythic scores alone", () => {
    const pts = [
      { score: 20.91, result: "win" as const, at: 1 },
      { score: 20.93, result: "loss" as const, at: 2 },
    ];
    const out = applyWithinRankMomentum(pts);
    expect(out[0].score).toBeCloseTo(20.91);
    expect(out[1].score).toBeCloseTo(20.93);
  });
});
