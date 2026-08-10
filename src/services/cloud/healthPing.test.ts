import { describe, expect, it, beforeEach } from "vitest";
import {
  buildPing,
  countMatchesLast24h,
  dayKey,
  shouldSendToday,
  PARSER_VERSION,
} from "./healthPing";
import { APP_VERSION } from "../../version";
import type { TrackedMatch, TrackerStatus } from "../../types/tracker";

const NOW = Date.UTC(2026, 7, 10, 12, 0, 0);
const hoursAgo = (h: number) => NOW - h * 60 * 60 * 1000;

function match(endedAt: number): TrackedMatch {
  return {
    matchId: `m-${endedAt}`,
    startedAt: endedAt - 600_000,
    endedAt,
    eventId: "Ladder",
    bestOf: 1,
    myTeamId: 1,
    games: [],
    result: "win",
  };
}

const status: TrackerStatus = {
  logPath: "C:/x/Player.log",
  logFound: true,
  detailedLogs: true,
  lastEventAt: NOW,
  matchesRecorded: 42,
  parseErrors: 3,
  localPlayer: "SomePlayer#12345",
  backfillDone: true,
};

describe("countMatchesLast24h", () => {
  it("counts only the trailing 24h", () => {
    const matches = [
      match(hoursAgo(1)),
      match(hoursAgo(23)),
      match(hoursAgo(25)), // outside
      match(hoursAgo(400)), // outside
    ];
    expect(countMatchesLast24h(matches, NOW)).toBe(2);
  });

  it("ignores matches dated in the future (clock skew)", () => {
    expect(countMatchesLast24h([match(NOW + 60_000)], NOW)).toBe(0);
  });

  it("is zero for an empty history", () => {
    expect(countMatchesLast24h([], NOW)).toBe(0);
  });
});

describe("buildPing", () => {
  it("sends exactly the documented field set and nothing else", () => {
    const ping = buildPing("id-1", status, [match(hoursAgo(2))], NOW);
    expect(Object.keys(ping).sort()).toEqual(
      [
        "appVersion",
        "detailedLogs",
        "installId",
        "logFound",
        "matchesLast24h",
        "os",
        "parseErrors",
        "parserVersion",
      ].sort(),
    );
  });

  it("never leaks the player name or log path from TrackerStatus", () => {
    const ping = buildPing("id-1", status, [], NOW);
    const serialized = JSON.stringify(ping);
    expect(serialized).not.toContain("SomePlayer");
    expect(serialized).not.toContain("Player.log");
    expect(serialized).not.toContain("C:/");
  });

  it("carries the health signals the ping exists for", () => {
    const ping = buildPing("id-1", status, [match(hoursAgo(2))], NOW);
    expect(ping.parseErrors).toBe(3);
    expect(ping.logFound).toBe(true);
    expect(ping.detailedLogs).toBe(true);
    expect(ping.matchesLast24h).toBe(1);
    expect(ping.appVersion).toBe(APP_VERSION);
    expect(ping.parserVersion).toBe(PARSER_VERSION);
  });

  it("degrades to safe defaults when the tracker has no status yet", () => {
    const ping = buildPing("id-1", null, [], NOW);
    expect(ping.logFound).toBe(false);
    expect(ping.detailedLogs).toBeNull();
    expect(ping.parseErrors).toBe(0);
  });
});

/** Same in-memory stub the other storage-backed services use in tests. */
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

describe("dayKey / shouldSendToday", () => {
  beforeEach(() => memStorage());

  it("formats a zero-padded local day", () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("is true on a fresh install and false once today is marked", () => {
    const now = new Date(2026, 7, 10);
    expect(shouldSendToday(now)).toBe(true);
    localStorage.setItem("bbi.health.lastSentDay", dayKey(now));
    expect(shouldSendToday(now)).toBe(false);
  });

  it("becomes true again the next day", () => {
    const today = new Date(2026, 7, 10);
    localStorage.setItem("bbi.health.lastSentDay", dayKey(today));
    expect(shouldSendToday(new Date(2026, 7, 11))).toBe(true);
  });
});
