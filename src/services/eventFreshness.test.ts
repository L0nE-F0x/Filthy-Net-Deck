import { describe, expect, it } from "vitest";
import {
  daysSinceEvent,
  filterFreshTournaments,
  isFreshEventDate,
} from "./eventFreshness";

const NOW = new Date("2026-07-19T15:00:00Z").getTime();

describe("isFreshEventDate", () => {
  it("keeps events within the last 120 days", () => {
    expect(isFreshEventDate("2026-07-15", { nowMs: NOW })).toBe(true);
    expect(isFreshEventDate("2026-04-01", { nowMs: NOW })).toBe(true);
  });

  it("drops 2020-era and other ancient rows", () => {
    expect(isFreshEventDate("2020-03-18", { nowMs: NOW })).toBe(false);
    expect(isFreshEventDate("2024-01-01", { nowMs: NOW })).toBe(false);
  });

  it("fails closed on missing or garbage dates", () => {
    expect(isFreshEventDate(null, { nowMs: NOW })).toBe(false);
    expect(isFreshEventDate("", { nowMs: NOW })).toBe(false);
    expect(isFreshEventDate("not-a-date", { nowMs: NOW })).toBe(false);
  });
});

describe("daysSinceEvent", () => {
  it("returns ~0 for today", () => {
    expect(daysSinceEvent("2026-07-19", NOW)).toBe(0);
  });
});

describe("filterFreshTournaments", () => {
  it("filters a mixed list", () => {
    const rows = [
      { date: "2026-07-10", name: "recent" },
      { date: "2020-04-11", name: "ancient" },
      { date: "2026-06-01", name: "ok" },
    ];
    const out = filterFreshTournaments(rows, { nowMs: NOW });
    expect(out.map((r) => r.name)).toEqual(["recent", "ok"]);
  });
});
