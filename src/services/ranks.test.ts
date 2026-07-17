import { describe, expect, it } from "vitest";
import { formatRank, parseRank, rankLabelFromScore } from "./ranks";

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
});
