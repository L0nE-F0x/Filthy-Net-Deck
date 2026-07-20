import { describe, expect, it } from "vitest";
import {
  buildDailyDigest,
  digestWindow,
  rankDeltaInWindow,
  recordInWindow,
  topMetaMover,
} from "./dailyDigest";
import type { TrackedMatch } from "../types/tracker";
import type { MetaChange } from "./metaDiff";

function match(
  partial: Partial<TrackedMatch> & Pick<TrackedMatch, "matchId" | "endedAt" | "result">,
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

describe("digestWindow", () => {
  it("uses last open when older than 2h", () => {
    const now = 1_000_000_000;
    const last = now - 3 * 3600_000;
    const w = digestWindow(now, last);
    expect(w.fromMs).toBe(last);
    expect(w.label).toBe("Since last open");
  });

  it("falls back to yesterday+today when no last open", () => {
    const now = Date.parse("2026-07-20T15:00:00");
    const w = digestWindow(now, null);
    expect(w.label).toBe("Yesterday + today");
    expect(w.toMs).toBe(now);
    expect(w.fromMs).toBeLessThan(now);
  });
});

describe("recordInWindow", () => {
  it("counts wins/losses inside the window only", () => {
    const now = 10_000;
    const matches = [
      match({ matchId: "a", endedAt: 1000, result: "win" }),
      match({ matchId: "b", endedAt: 5000, result: "loss" }),
      match({ matchId: "c", endedAt: 50, result: "win" }), // outside
    ];
    const r = recordInWindow(matches, 500, now);
    expect(r).toEqual({ wins: 1, losses: 1, games: 2, wrPct: 50 });
  });
});

describe("rankDeltaInWindow", () => {
  it("returns null without two distinct stamps", () => {
    expect(rankDeltaInWindow([], 0, 100)).toBeNull();
    const one = [
      match({ matchId: "a", endedAt: 10, result: "win", myRank: "Gold 2" }),
    ];
    expect(rankDeltaInWindow(one, 0, 100)).toBeNull();
  });

  it("shows first→last when rank moved", () => {
    const matches = [
      match({ matchId: "a", endedAt: 10, result: "win", myRank: "Gold 3" }),
      match({ matchId: "b", endedAt: 20, result: "win", myRank: "Gold 2" }),
    ];
    const d = rankDeltaInWindow(matches, 0, 100);
    expect(d?.from).toContain("Gold");
    expect(d?.to).toContain("Gold");
    expect(d?.from).not.toBe(d?.to);
  });
});

describe("topMetaMover", () => {
  const changes: MetaChange[] = [
    {
      formatId: "standard",
      formatName: "Standard",
      mode: "bo3",
      rose: ["Izzet Prowess"],
      fell: ["Domain"],
      entered: [],
      left: [],
    },
  ];

  it("prefers rose for matching format/mode", () => {
    expect(topMetaMover(changes, "standard", "bo3")).toEqual({
      name: "Izzet Prowess",
      kind: "rose",
    });
  });

  it("returns null when empty", () => {
    expect(topMetaMover([], "standard", "bo1")).toBeNull();
  });
});

describe("buildDailyDigest", () => {
  it("returns at most 3 chips and skips empty sides", () => {
    const now = Date.parse("2026-07-20T18:00:00Z");
    const matches = [
      match({
        matchId: "1",
        endedAt: now - 3600_000,
        result: "win",
        myRank: "Platinum 4",
      }),
      match({
        matchId: "2",
        endedAt: now - 1800_000,
        result: "loss",
        myRank: "Platinum 3",
      }),
    ];
    const { chips } = buildDailyDigest({
      matches,
      nowMs: now,
      lastOpenMs: now - 5 * 3600_000,
      metaChanges: [
        {
          formatId: "standard",
          formatName: "Standard",
          mode: "bo1",
          rose: [],
          fell: [],
          entered: ["Mardu Discard"],
          left: [],
        },
      ],
      formatId: "standard",
      mode: "bo1",
    });
    expect(chips.length).toBeGreaterThan(0);
    expect(chips.length).toBeLessThanOrEqual(3);
    expect(chips.some((c) => c.kind === "record")).toBe(true);
    expect(chips.some((c) => c.kind === "meta")).toBe(true);
  });

  it("returns no chips when nothing happened", () => {
    const { chips } = buildDailyDigest({
      matches: [],
      nowMs: Date.now(),
      lastOpenMs: null,
      metaChanges: [],
      mode: "bo1",
    });
    expect(chips).toEqual([]);
  });

  it("fills with streak and rotation when primary chips are empty", () => {
    const { chips } = buildDailyDigest({
      matches: [],
      nowMs: Date.now(),
      lastOpenMs: null,
      metaChanges: [],
      mode: "bo1",
      streak: { type: "win", length: 4 },
      rotationDays: 12,
    });
    expect(chips.map((c) => c.kind)).toEqual(["streak", "rotation"]);
  });
});
