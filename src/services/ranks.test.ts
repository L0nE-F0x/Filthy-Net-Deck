import { describe, expect, it } from "vitest";
import {
  formatRank,
  mythicAxisLabel,
  parseRank,
  rankLabelFromScore,
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
