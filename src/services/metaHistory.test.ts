import { describe, expect, it } from "vitest";
import {
  mergeHistoryDay,
  seriesForArchetype,
  topMovers,
  type HistoryPoint,
} from "./metaHistory";

const sample: HistoryPoint[] = [
  { date: "2026-07-10", format: "standard", mode: "bo1", archetype: "Izzet", pct: 10 },
  { date: "2026-07-11", format: "standard", mode: "bo1", archetype: "Izzet", pct: 12 },
  { date: "2026-07-12", format: "standard", mode: "bo1", archetype: "Izzet", pct: 15 },
  { date: "2026-07-12", format: "standard", mode: "bo1", archetype: "Domain", pct: 8 },
  { date: "2026-07-10", format: "standard", mode: "bo1", archetype: "Domain", pct: 14 },
];

describe("mergeHistoryDay", () => {
  it("replaces same date/format/mode and keeps max days", () => {
    const next = mergeHistoryDay(
      sample,
      "2026-07-12",
      [{ format: "standard", mode: "bo1", archetype: "Izzet", pct: 16 }],
      45,
    );
    const izzet = next.filter((p) => p.archetype === "Izzet" && p.date === "2026-07-12");
    expect(izzet).toHaveLength(1);
    expect(izzet[0].pct).toBe(16);
    // Domain on 2026-07-12 was same format/mode so replaced away when only Izzet in rows
    expect(next.some((p) => p.archetype === "Domain" && p.date === "2026-07-12")).toBe(
      false,
    );
  });
});

describe("seriesForArchetype", () => {
  it("returns ordered pct series for one archetype", () => {
    const s = seriesForArchetype(sample, {
      format: "standard",
      mode: "bo1",
      archetype: "Izzet",
      days: 30,
    });
    expect(s.map((p) => p.pct)).toEqual([10, 12, 15]);
  });
});

describe("topMovers", () => {
  it("ranks by absolute delta", () => {
    const m = topMovers(sample, { format: "standard", mode: "bo1", limit: 2 });
    expect(m[0].archetype).toBe("Domain"); // 14 → 8 = -6
    expect(m[0].delta).toBe(-6);
  });
});
