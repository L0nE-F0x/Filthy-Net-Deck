import { describe, expect, it } from "vitest";
import {
  buildRankSeries,
  estimateMatchesPerStep,
  formatRank,
  isLadderEvent,
  mythicAxisLabel,
  parseRank,
  queueRankedKind,
  rankLabelFromScore,
  rankedChipLabel,
  rankSeriesDomain,
} from "./ranks";

describe("parseRank", () => {
  it("parses division ranks and mythic pct", () => {
    const d = parseRank("Diamond 1");
    expect(d?.tier).toBe("Diamond");
    expect(d?.division).toBe(1);
    expect(d?.score).toBe(19);
    const m = parseRank("Mythic 82%");
    expect(m?.tier).toBe("Mythic");
    expect(m?.mythicPct).toBe(82);
    expect(formatRank(d!)).toBe("Diamond 1");
    expect(rankLabelFromScore(18)).toBe("Diamond 2");
  });

  it("parses decimal mythic percentiles with a monotonic score", () => {
    const a = parseRank("Mythic 93.4%");
    expect(a?.mythicPct).toBeCloseTo(93.4);
    expect(a?.score).toBeCloseTo(20.934);
    const b = parseRank("Mythic 95.1%");
    expect(b!.score).toBeGreaterThan(a!.score);
    expect(formatRank(a!)).toBe("Mythic 93%");
  });

  it("parses mythic leaderboard place above every percentile", () => {
    const place = parseRank("Mythic #874");
    expect(place?.tier).toBe("Mythic");
    expect(place?.mythicPlace).toBe(874);
    expect(place!.score).toBeGreaterThan(parseRank("Mythic 100%")!.score - 0.001);
    const better = parseRank("Mythic #12");
    expect(better!.score).toBeGreaterThan(place!.score);
    expect(formatRank(place!)).toBe("Mythic #874");
  });

  it("bare Mythic still parses at the tier floor", () => {
    const m = parseRank("Mythic");
    expect(m?.tier).toBe("Mythic");
    expect(m?.score).toBe(20);
    expect(formatRank(m!)).toBe("Mythic");
  });
});

describe("mythicAxisLabel", () => {
  it("labels percent bands, with decimals when the span is tight", () => {
    expect(mythicAxisLabel(20.9, 0.5)).toBe("90%");
    expect(mythicAxisLabel(20.934, 0.02)).toBe("93.4%");
  });

  it("labels leaderboard scores as places", () => {
    expect(mythicAxisLabel(21 + (1 - 874 / 1200), 0.5)).toBe("#874");
    expect(rankLabelFromScore(21 + (1 - 874 / 1200))).toBe("Mythic #874");
  });
});

describe("rankSeriesDomain", () => {
  /** Fraction of the chart's height the data actually occupies. */
  const fill = (scores: number[]) => {
    const { lo, hi } = rankSeriesDomain(scores);
    return (Math.max(...scores) - Math.min(...scores)) / (hi - lo);
  };

  it("zooms into the Mythic band so a percentile move is visible", () => {
    // The reported case: Mythic 94% → 92.7% is 0.013 of a score point. Under
    // the old flat 0.5-wide floor it filled 2.6% of the height — a flat line.
    const scores = [20.94, 20.933, 20.928, 20.927];
    expect(fill(scores)).toBeGreaterThan(0.2);
    const { lo, hi } = rankSeriesDomain(scores);
    expect(lo).toBeGreaterThanOrEqual(20);
    expect(hi).toBeLessThanOrEqual(22);
  });

  it("keeps a single repeated Mythic score from dividing by zero", () => {
    const { lo, hi } = rankSeriesDomain([20.5, 20.5, 20.5]);
    expect(hi).toBeGreaterThan(lo);
    expect(hi - lo).toBeCloseTo(0.05, 5);
  });

  it("uses whole steps for the tier ladder", () => {
    const { lo, hi } = rankSeriesDomain([14, 15, 16]);
    expect(lo).toBe(14);
    expect(hi).toBe(16);
  });

  it("pads a flat tier run to a readable span", () => {
    const { lo, hi } = rankSeriesDomain([12, 12]);
    expect(hi - lo).toBe(2);
  });

  it("zooms into within-division pip momentum instead of a 2-step pad", () => {
    // Gold 4 + synthetic W/L drift (see applyWithinRankMomentum).
    const scores = [12.12, 12.24, 12.12, 12.24];
    const { lo, hi } = rankSeriesDomain(scores);
    expect(hi - lo).toBeLessThan(1);
    expect(fill(scores)).toBeGreaterThan(0.2);
  });

  it("never returns an empty domain", () => {
    const { lo, hi } = rankSeriesDomain([]);
    expect(hi).toBeGreaterThan(lo);
  });

  it("handles leaderboard scores above 21", () => {
    const { lo, hi } = rankSeriesDomain([21.2, 21.25]);
    expect(hi).toBeGreaterThan(lo);
    expect(hi).toBeLessThanOrEqual(22);
  });
});

describe("isLadderEvent", () => {
  it("accepts constructed ranked queues only", () => {
    expect(isLadderEvent("Ladder")).toBe(true);
    expect(isLadderEvent("Traditional_Ladder")).toBe(true);
    expect(isLadderEvent("Alchemy_Ladder")).toBe(true);
    expect(isLadderEvent("Play")).toBe(false);
    expect(isLadderEvent("Traditional_Play")).toBe(false);
    expect(isLadderEvent("Brawl")).toBe(false);
    expect(isLadderEvent("QuickDraft_DSK_20260701")).toBe(false);
    expect(isLadderEvent("PremierDraft_TDM")).toBe(false);
    expect(isLadderEvent(undefined)).toBe(false);
  });
});

describe("queueRankedKind / buildRankSeries ladder filter", () => {
  it("labels ranked vs unranked queues", () => {
    expect(queueRankedKind("Ladder")).toBe("ranked");
    expect(queueRankedKind("Traditional_Ladder")).toBe("ranked");
    expect(queueRankedKind("Play")).toBe("unranked");
    expect(queueRankedKind("Traditional_Play")).toBe("unranked");
    expect(queueRankedKind("PremierDraft_TDM")).toBe("unranked");
    expect(queueRankedKind("")).toBe("unknown");
    expect(queueRankedKind(undefined)).toBe("unknown");
    expect(rankedChipLabel("Ladder")).toBe("Ranked");
    expect(rankedChipLabel("Play")).toBe("Unranked");
  });

  it("drops Play/draft samples that only carry a constructed stamp", () => {
    const series = buildRankSeries([
      {
        matchId: "r1",
        endedAt: 100,
        myRank: "Gold 4",
        eventId: "Ladder",
        result: "win",
      },
      {
        matchId: "u1",
        endedAt: 200,
        myRank: "Gold 4",
        eventId: "Play",
        result: "loss",
      },
      {
        matchId: "r2",
        endedAt: 300,
        myRank: "Gold 3",
        eventId: "Ladder",
        result: "win",
      },
    ]);
    expect(series.map((p) => p.matchId)).toEqual(["r1", "r2"]);
    expect(series.every((p) => p.result !== "loss")).toBe(true);
  });
});

describe("estimateMatchesPerStep", () => {
  const game = (
    i: number,
    myRank: string | undefined,
    eventId: string,
  ) => ({
    matchId: `m-${i}`,
    endedAt: 1_000 + i * 10,
    result: "win",
    myRank,
    eventId,
  });

  it("counts only ladder games between two rank samples", () => {
    // Two ranked games took one whole step; the drafts in between took none.
    const ladder = [
      game(0, "Gold 4", "Ladder"),
      game(9, "Gold 3", "Ladder"),
    ];
    const padded = [
      ladder[0],
      ...Array.from({ length: 7 }, (_, i) =>
        game(i + 1, "Gold 4", "PremierDraft_TDM"),
      ),
      ladder[1],
    ];
    expect(estimateMatchesPerStep(padded)).toEqual(
      estimateMatchesPerStep(ladder),
    );
  });

  it("falls back to the default when nothing ranked was played", () => {
    const drafts = [
      game(0, "Gold 4", "QuickDraft_TDM"),
      game(1, "Gold 3", "QuickDraft_TDM"),
    ];
    expect(estimateMatchesPerStep(drafts).source).toBe("default");
  });
});
