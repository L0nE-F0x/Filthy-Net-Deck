import { beforeEach, describe, expect, it } from "vitest";
import {
  buildOnboardingSteps,
  diagnoseTrackerHealth,
  needsOnboardingCoach,
  onboardingProgress,
  recordFunnelMilestone,
  readFunnelMilestones,
  syncFunnelFromState,
} from "./trackerHealth";
import type { TrackerStatus } from "../types/tracker";
import type { TrackedMatch } from "../types/tracker";

function status(partial: Partial<TrackerStatus>): TrackerStatus {
  return {
    logPath: "C:/Logs/Player.log",
    logFound: true,
    detailedLogs: true,
    lastEventAt: Date.now(),
    matchesRecorded: 0,
    parseErrors: 0,
    localPlayer: "Pilot",
    backfillDone: true,
    ...partial,
  };
}

function match(id: string): TrackedMatch {
  return {
    matchId: id,
    startedAt: 1,
    endedAt: 2,
    eventId: "Ladder",
    bestOf: 1,
    myTeamId: 1,
    games: [],
    result: "win",
  };
}

describe("trackerHealth", () => {
  it("flags no log and detailed-off phases", () => {
    const noLog = diagnoseTrackerHealth(status({ logFound: false }), 0);
    expect(noLog.phase).toBe("no_log");
    expect(noLog.tone).toBe("warn");

    const off = diagnoseTrackerHealth(status({ detailedLogs: false }), 0);
    expect(off.phase).toBe("detailed_off");
    expect(off.tone).toBe("bad");
  });

  it("surfaces parse stress when many errors pile up", () => {
    const v = diagnoseTrackerHealth(status({ parseErrors: 5, matchesRecorded: 3 }), 3);
    expect(v.phase).toBe("parse_stress");
    expect(v.detail.toLowerCase()).toContain("parsed");
  });

  it("builds three onboarding steps with progressive completion", () => {
    const steps = buildOnboardingSteps(status({ logFound: true }), 2, 1);
    expect(steps).toHaveLength(3);
    expect(steps.every((s) => s.done)).toBe(true);

    const early = buildOnboardingSteps(status({ logFound: false }), 0, 0);
    expect(early.map((s) => s.done)).toEqual([false, false, false]);
  });

  it("coach stays on until log + match + early tag hygiene", () => {
    expect(needsOnboardingCoach(null, [], 0)).toBe(false);
    expect(needsOnboardingCoach(status({ logFound: false }), [], 0)).toBe(true);
    expect(needsOnboardingCoach(status({}), [], 0)).toBe(true);
    expect(needsOnboardingCoach(status({ matchesRecorded: 2 }), [match("a")], 0)).toBe(true);
    expect(needsOnboardingCoach(status({ matchesRecorded: 2 }), [match("a")], 1)).toBe(false);
  });

  it("onboardingProgress marks live when log + match are done", () => {
    const early = onboardingProgress(buildOnboardingSteps(status({ logFound: false }), 0, 0));
    expect(early.live).toBe(false);
    expect(early.done).toBe(0);

    const live = onboardingProgress(buildOnboardingSteps(status({}), 1, 0));
    expect(live.live).toBe(true);
    expect(live.done).toBe(2);
    expect(live.pct).toBe(67);
  });
});

describe("funnel milestones (local only)", () => {
  const KEY = "bbi.funnel.v1";
  const mem = new Map<string, string>();

  beforeEach(() => {
    mem.clear();
    const fake = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v);
      },
      removeItem: (k: string) => {
        mem.delete(k);
      },
    };
    Object.defineProperty(globalThis, "localStorage", {
      value: fake,
      configurable: true,
    });
  });

  it("records each milestone once and syncs from state", () => {
    const t0 = 1_000;
    recordFunnelMilestone("log", t0);
    recordFunnelMilestone("log", t0 + 50); // no overwrite
    expect(readFunnelMilestones().log).toBe(t0);

    syncFunnelFromState(status({ matchesRecorded: 1 }), 1, 0, t0 + 100);
    const snap = readFunnelMilestones();
    expect(snap.match).toBe(t0 + 100);
    expect(snap.live).toBe(t0 + 100);
    expect(snap.log).toBe(t0);

    syncFunnelFromState(status({ matchesRecorded: 1 }), 1, 2, t0 + 200);
    expect(readFunnelMilestones().tag).toBe(t0 + 200);
    expect(mem.has(KEY)).toBe(true);
  });
});

