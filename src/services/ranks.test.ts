import { describe, expect, it } from "vitest";
import {
  formatRank,
  mythicAxisLabel,
  parseRank,
  rankLabelFromScore,
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
