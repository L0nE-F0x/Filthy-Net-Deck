import { beforeEach, describe, expect, it } from "vitest";
import {
  dismissSeasonRecap,
  markSeasonRecapNotified,
  pickSeasonRecapNudge,
  seasonRecapHeadline,
  shouldNotifySeasonRecap,
  SEASON_RECAP_MIN_GAMES,
} from "./seasonRecapHabit";
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

function memStorage() {
  const mem = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v);
      },
      removeItem: (k: string) => {
        mem.delete(k);
      },
    },
    configurable: true,
  });
}

describe("pickSeasonRecapNudge", () => {
  beforeEach(() => memStorage());

  it("returns null when only the current season has games", () => {
    const matches = Array.from({ length: 6 }, (_, i) =>
      match({
        matchId: `c${i}`,
        endedAt: Date.parse("2026-07-10T12:00:00Z") + i * 1000,
        result: i % 2 === 0 ? "win" : "loss",
      }),
    );
    expect(
      pickSeasonRecapNudge(matches, {
        currentKey: "2026-07",
        dismissed: new Set(),
      }),
    ).toBeNull();
  });

  it("picks the most recent closed season with enough games", () => {
    const matches: TrackedMatch[] = [];
    for (let i = 0; i < 6; i++) {
      matches.push(
        match({
          matchId: `j${i}`,
          endedAt: Date.parse("2026-06-15T12:00:00Z") + i * 1000,
          result: "win",
          myRank: "Gold 2",
        }),
      );
    }
    for (let i = 0; i < 3; i++) {
      matches.push(
        match({
          matchId: `m${i}`,
          endedAt: Date.parse("2026-05-10T12:00:00Z") + i * 1000,
          result: "loss",
        }),
      );
    }
    const nudge = pickSeasonRecapNudge(matches, {
      currentKey: "2026-07",
      dismissed: new Set(),
      minGames: SEASON_RECAP_MIN_GAMES,
    });
    expect(nudge?.seasonKey).toBe("2026-06");
    expect(nudge?.wins).toBe(6);
  });

  it("skips dismissed seasons", () => {
    const matches = Array.from({ length: 6 }, (_, i) =>
      match({
        matchId: `j${i}`,
        endedAt: Date.parse("2026-06-15T12:00:00Z") + i * 1000,
        result: "win",
      }),
    );
    expect(
      pickSeasonRecapNudge(matches, {
        currentKey: "2026-07",
        dismissed: new Set(["2026-06"]),
      }),
    ).toBeNull();
  });
});

describe("notify + dismiss storage", () => {
  beforeEach(() => memStorage());

  it("tracks notified and dismissed keys", () => {
    const s = {
      seasonKey: "2026-06",
      games: 10,
      wins: 6,
      losses: 4,
      rate: 0.6,
      peakScore: 50,
      delta: 2,
    };
    expect(shouldNotifySeasonRecap(s)).toBe(true);
    markSeasonRecapNotified("2026-06");
    expect(shouldNotifySeasonRecap(s)).toBe(false);
    dismissSeasonRecap("2026-06");
    expect(
      pickSeasonRecapNudge(
        [
          match({
            matchId: "1",
            endedAt: Date.parse("2026-06-01T12:00:00Z"),
            result: "win",
          }),
        ],
        { currentKey: "2026-07", minGames: 1 },
      ),
    ).toBeNull();
  });

  it("builds a headline", () => {
    const h = seasonRecapHeadline({
      seasonKey: "2026-06",
      games: 10,
      wins: 6,
      losses: 4,
      rate: 0.6,
      peakScore: null,
      delta: null,
    });
    expect(h.toLowerCase()).toContain("recap");
    expect(h).toContain("60%");
  });
});
