import { beforeEach, describe, expect, it } from "vitest";
import {
  buildSessionWrap,
  dismissSessionWrap,
  isSessionWrapDismissed,
  sessionWrapDismissKey,
  sessionWrapHeadline,
} from "./sessionWrap";
import type { TrackedMatch } from "../types/tracker";

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

function match(
  partial: Partial<TrackedMatch> &
    Pick<TrackedMatch, "matchId" | "endedAt" | "result">,
): TrackedMatch {
  return {
    startedAt: partial.endedAt - 600_000,
    eventId: "Ladder",
    bestOf: 1,
    myTeamId: 0,
    games: [],
    ...partial,
  };
}

describe("buildSessionWrap", () => {
  it("returns null when fewer than min decided games", () => {
    const now = 10_000_000;
    const matches = [
      match({ matchId: "1", endedAt: now - 1000, result: "win" }),
      match({ matchId: "2", endedAt: now - 500, result: "loss" }),
    ];
    expect(buildSessionWrap(matches, now, { force: true, minDecided: 3 })).toBeNull();
  });

  it("builds a wrap for a finished session", () => {
    const now = 10_000_000;
    const base = now - 30 * 60_000; // 30 min idle
    const matches = [
      match({
        matchId: "1",
        endedAt: base - 20 * 60_000,
        result: "win",
        deckName: "Izzet",
      }),
      match({
        matchId: "2",
        endedAt: base - 10 * 60_000,
        result: "win",
        deckName: "Izzet",
      }),
      match({
        matchId: "3",
        endedAt: base,
        result: "loss",
        deckName: "Izzet",
      }),
    ];
    const w = buildSessionWrap(matches, now, { idleMs: 20 * 60_000, minDecided: 3 });
    expect(w).not.toBeNull();
    expect(w!.stats.wins).toBe(2);
    expect(w!.stats.losses).toBe(1);
    expect(w!.bestDeckName).toBe("Izzet");
    expect(sessionWrapHeadline(w!)).toContain("2–1");
  });

  it("respects dismiss keys", () => {
    memStorage();
    const key = "abc";
    expect(isSessionWrapDismissed(key)).toBe(false);
    dismissSessionWrap(key);
    expect(isSessionWrapDismissed(key)).toBe(true);
    expect(sessionWrapDismissKey({
      fromMs: 1,
      toMs: 2,
      stats: {
        fromMs: 1,
        toMs: 2,
        wins: 1,
        losses: 0,
        draws: 0,
        games: 1,
        winrate: 1,
        bestDeck: null,
        worstDeck: null,
        startRank: null,
        endRank: null,
        rankDeltaLabel: null,
      },
      bestDeckName: null,
      matchCount: 1,
    })).toBe("1-2-1-0");
  });
});

describe("storage bootstrap", () => {
  beforeEach(() => memStorage());
  it("noop", () => {
    expect(true).toBe(true);
  });
});
