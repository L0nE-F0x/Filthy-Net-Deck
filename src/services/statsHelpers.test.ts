import { describe, expect, it } from "vitest";
import {
  formExtremes,
  isSameLocalDay,
  rollingWinrate,
  tallyMatches,
} from "./statsHelpers";
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

describe("tallyMatches", () => {
  it("counts wins/losses and rate", () => {
    const t = tallyMatches([
      match({ matchId: "1", endedAt: 1, result: "win" }),
      match({ matchId: "2", endedAt: 2, result: "loss" }),
      match({ matchId: "3", endedAt: 3, result: "draw" }),
    ]);
    expect(t).toEqual({ wins: 1, losses: 1, decided: 2, rate: 0.5 });
  });
});

describe("isSameLocalDay", () => {
  it("compares local calendar days", () => {
    const noon = Date.parse("2026-07-20T12:00:00");
    expect(isSameLocalDay(noon, noon + 3600_000)).toBe(true);
    expect(isSameLocalDay(noon, noon + 86400000)).toBe(false);
  });
});

describe("rollingWinrate", () => {
  it("returns chronological rates over a sliding window", () => {
    const matches = [
      match({ matchId: "1", endedAt: 1, result: "win" }),
      match({ matchId: "2", endedAt: 2, result: "win" }),
      match({ matchId: "3", endedAt: 3, result: "loss" }),
    ];
    const r = rollingWinrate(matches, 2);
    expect(r).toEqual([1, 1, 0.5]);
  });
});

describe("formExtremes", () => {
  it("needs a full window", () => {
    expect(
      formExtremes(
        [match({ matchId: "1", endedAt: 1, result: "win" })],
        3,
      ).best,
    ).toBeNull();
  });

  it("finds best and worst stretches", () => {
    // WWW LLL — window 3: best 1.0, worst 0.0
    const matches = [
      match({ matchId: "1", endedAt: 1, result: "win" }),
      match({ matchId: "2", endedAt: 2, result: "win" }),
      match({ matchId: "3", endedAt: 3, result: "win" }),
      match({ matchId: "4", endedAt: 4, result: "loss" }),
      match({ matchId: "5", endedAt: 5, result: "loss" }),
      match({ matchId: "6", endedAt: 6, result: "loss" }),
    ];
    const { best, worst } = formExtremes(matches, 3);
    expect(best?.rate).toBe(1);
    expect(worst?.rate).toBe(0);
  });
});
