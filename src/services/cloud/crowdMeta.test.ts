import { describe, expect, it } from "vitest";
import {
  wilson,
  orient,
  usable,
  matchupsFor,
  describe as describeMatchup,
  MIN_GAMES,
  type RollupRow,
} from "./crowdMeta";

function row(over: Partial<RollupRow> = {}): RollupRow {
  return {
    format: "standard",
    best_of: 1,
    a_archetype: "standard-azorius-control",
    b_archetype: "standard-mono-red-aggro",
    games: 100,
    a_wins: 60,
    a_on_play_games: 50,
    a_on_play_wins: 32,
    contributors: 12,
    ...over,
  };
}

describe("wilson", () => {
  it("is far more conservative than the naive proportion on small samples", () => {
    const { low, high } = wilson(7, 10); // 70% naive
    expect(low).toBeLessThan(50);
    expect(high).toBeGreaterThan(85);
  });

  it("tightens as the sample grows", () => {
    const small = wilson(70, 100);
    const big = wilson(700, 1000);
    expect(big.high - big.low).toBeLessThan(small.high - small.low);
  });

  it("stays inside 0–100 at the extremes", () => {
    expect(wilson(0, 30).low).toBe(0);
    expect(wilson(30, 30).high).toBe(100);
    expect(wilson(0, 0)).toEqual({ low: 0, high: 0 });
  });
});

describe("orient", () => {
  it("reads the a-side directly", () => {
    const m = orient(row(), "standard-azorius-control")!;
    expect(m.wins).toBe(60);
    expect(m.opponent).toBe("standard-mono-red-aggro");
    expect(Math.round(m.winrate)).toBe(60);
  });

  it("mirrors for the b-side — the bug that would skew every table", () => {
    const m = orient(row(), "standard-mono-red-aggro")!;
    expect(m.wins).toBe(40);
    expect(m.opponent).toBe("standard-azorius-control");
    expect(Math.round(m.winrate)).toBe(40);
  });

  it("returns null for an unrelated archetype", () => {
    expect(orient(row(), "standard-something-else")).toBeNull();
  });

  it("labels slugs for display without the format prefix", () => {
    const m = orient(row(), "standard-azorius-control")!;
    expect(m.subjectLabel).toBe("Azorius Control");
    expect(m.opponentLabel).toBe("Mono Red Aggro");
  });
});

describe("suppression", () => {
  it("drops cells below the sample floor rather than showing a number", () => {
    expect(usable(orient(row({ games: MIN_GAMES - 1, a_wins: 20 }), "standard-azorius-control")!)).toBe(false);
    expect(usable(orient(row({ games: MIN_GAMES, a_wins: 20 }), "standard-azorius-control")!)).toBe(true);
  });

  it("reports how many were withheld so the UI can be honest about it", () => {
    const rows = [
      row({ games: 200, a_wins: 120 }),
      row({ b_archetype: "standard-dimir-midrange", games: 5, a_wins: 3 }),
      row({ b_archetype: "standard-golgari-ramp", games: 12, a_wins: 6 }),
    ];
    const { shown, suppressed } = matchupsFor(rows, "standard-azorius-control");
    expect(shown).toHaveLength(1);
    expect(suppressed).toBe(2);
  });

  it("sorts strongest first", () => {
    const rows = [
      row({ b_archetype: "standard-a", games: 100, a_wins: 40 }),
      row({ b_archetype: "standard-b", games: 100, a_wins: 70 }),
      row({ b_archetype: "standard-c", games: 100, a_wins: 55 }),
    ];
    const { shown } = matchupsFor(rows, "standard-azorius-control");
    expect(shown.map((m) => m.opponent)).toEqual(["standard-b", "standard-c", "standard-a"]);
  });
});

describe("describe", () => {
  it("always carries the sample size and a margin, never a bare percentage", () => {
    const text = describeMatchup(orient(row(), "standard-azorius-control")!);
    expect(text).toMatch(/^\d+% \(±\d+\) · 100 games$/);
  });
});
