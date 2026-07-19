import { describe, expect, it } from "vitest";
import {
  buildOnboardingSteps,
  diagnoseTrackerHealth,
  needsOnboardingCoach,
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
});
