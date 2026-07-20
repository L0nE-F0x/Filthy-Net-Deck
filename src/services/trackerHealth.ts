/**
 * Pure tracker health / onboarding helpers — shared by Settings, My Stats,
 * Climb, and Matchups empty states.
 */
import type { TrackerStatus } from "../types/tracker";
import type { TrackedMatch } from "../types/tracker";
import { timeAgo } from "./tracker";

export type HealthTone = "good" | "warn" | "bad" | "off";

export type HealthPhase =
  | "browser"
  | "no_log"
  | "detailed_off"
  | "waiting_first"
  | "parse_stress"
  | "tracking";

export interface TrackerHealthView {
  phase: HealthPhase;
  tone: HealthTone;
  headline: string;
  detail: string;
  /** Short chips for the onboarding rail. */
  steps: OnboardingStep[];
}

export interface OnboardingStep {
  id: "log" | "match" | "tag";
  label: string;
  done: boolean;
  hint: string;
}

export function buildOnboardingSteps(
  status: TrackerStatus | null,
  matchCount: number,
  taggedOpponentCount: number,
): OnboardingStep[] {
  const logOk = !!status?.logFound && status.detailedLogs !== false;
  const matchOk = matchCount > 0;
  const tagOk = taggedOpponentCount > 0;
  return [
    {
      id: "log",
      label: "Arena log found",
      done: logOk,
      hint: logOk
        ? "Player.log is live"
        : "Launch Arena + enable Detailed Logs (Options → Account)",
    },
    {
      id: "match",
      label: "First match recorded",
      done: matchOk,
      hint: matchOk
        ? `${matchCount} match${matchCount === 1 ? "" : "es"} on this PC`
        : "Keep Filthy Net Deck open while you play a ranked game",
    },
    {
      id: "tag",
      label: "First opponent tagged",
      done: tagOk,
      hint: tagOk
        ? "Matchup Lab is learning your field"
        : "After a match, tag the opponent’s archetype in Matchups",
    },
  ];
}

export function diagnoseTrackerHealth(
  status: TrackerStatus | null,
  matchCount: number,
  opts?: { taggedOpponentCount?: number },
): TrackerHealthView {
  const steps = buildOnboardingSteps(
    status,
    matchCount,
    opts?.taggedOpponentCount ?? 0,
  );

  if (!status) {
    return {
      phase: "browser",
      tone: "off",
      headline: "Desktop app only",
      detail:
        "Win-rate tracking needs the Filthy Net Deck desktop app reading Arena’s Player.log on this PC.",
      steps,
    };
  }

  if (!status.logFound) {
    return {
      phase: "no_log",
      tone: "warn",
      headline: "Waiting for MTG Arena",
      detail: `No Player.log yet. Launch Arena once. Looking at: ${status.logPath}`,
      steps,
    };
  }

  if (status.detailedLogs === false) {
    return {
      phase: "detailed_off",
      tone: "bad",
      headline: "Detailed logs are off",
      detail:
        "In Arena: Options → Account → enable Detailed Logs (Plugin Support), then restart Arena. Every third-party tracker needs this same switch.",
      steps,
    };
  }

  if (status.parseErrors > 0 && status.parseErrors >= 3) {
    const last =
      status.lastEventAt != null ? ` Last Arena chatter ${timeAgo(status.lastEventAt)}.` : "";
    return {
      phase: "parse_stress",
      tone: "warn",
      headline: "Arena log looks different",
      detail: `${status.parseErrors} events could not be parsed — an Arena client update may have changed the format. Tracking may be incomplete until Filthy Net Deck updates.${last} Your saved matches are still safe on this PC.`,
      steps,
    };
  }

  if (matchCount === 0) {
    return {
      phase: "waiting_first",
      tone: "good",
      headline: status.localPlayer
        ? `Ready · ${status.localPlayer}`
        : "Ready — waiting for your first match",
      detail:
        "Log is found. Keep this app open (or in the tray) while you ladder — the first finished match fills My Stats, Climb, and Matchups.",
      steps,
    };
  }

  const lastMatchHint =
    status.lastEventAt != null
      ? ` Last event ${timeAgo(status.lastEventAt)}.`
      : "";
  return {
    phase: "tracking",
    tone: "good",
    headline: status.localPlayer
      ? `Tracking · ${status.localPlayer}`
      : "Tracking Arena matches",
    detail: `${status.matchesRecorded} match${status.matchesRecorded === 1 ? "" : "es"} recorded on this PC.${lastMatchHint}${
      status.parseErrors > 0
        ? ` (${status.parseErrors} minor parse skip${status.parseErrors === 1 ? "" : "s"}.)`
        : ""
    }`,
    steps,
  };
}

/** True when the pilot has not finished the first-session loop. */
export function needsOnboardingCoach(
  status: TrackerStatus | null,
  matches: TrackedMatch[],
  taggedOpponentCount: number,
): boolean {
  if (!status) return false;
  if (!status.logFound || status.detailedLogs === false) return true;
  if (matches.length === 0) return true;
  if (taggedOpponentCount === 0 && matches.length > 0 && matches.length < 8) return true;
  return false;
}

/** Steps complete + whether the tracker is "live" (log + ≥1 match). */
export function onboardingProgress(steps: OnboardingStep[]): {
  done: number;
  total: number;
  pct: number;
  /** Log found + detailed on + first match — the sub-2-minute value moment. */
  live: boolean;
} {
  const total = steps.length;
  const done = steps.filter((s) => s.done).length;
  const log = steps.find((s) => s.id === "log")?.done === true;
  const match = steps.find((s) => s.id === "match")?.done === true;
  return {
    done,
    total,
    pct: total ? Math.round((done / total) * 100) : 0,
    live: log && match,
  };
}

/* ------------------------------------------------------------------ */
/* Local funnel milestones (never uploaded — D1 instrumentation)       */
/* ------------------------------------------------------------------ */

const FUNNEL_KEY = "bbi.funnel.v1";

export type FunnelMilestone = "log" | "match" | "tag" | "live";

export type FunnelSnapshot = Partial<Record<FunnelMilestone, number>>;

export function readFunnelMilestones(): FunnelSnapshot {
  try {
    const raw = localStorage.getItem(FUNNEL_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as FunnelSnapshot;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeFunnelMilestones(snap: FunnelSnapshot): void {
  try {
    localStorage.setItem(FUNNEL_KEY, JSON.stringify(snap));
  } catch {
    /* private mode / quota — ignore */
  }
}

/** Record a milestone once (first timestamp wins). Local only. */
export function recordFunnelMilestone(
  id: FunnelMilestone,
  atMs = Date.now(),
): FunnelSnapshot {
  const snap = readFunnelMilestones();
  if (snap[id] == null) {
    snap[id] = atMs;
    writeFunnelMilestones(snap);
  }
  return snap;
}

/**
 * Sync funnel stamps from current tracker state. Idempotent; safe to call
 * on every Settings/onboarding paint. Does not send anything off-box.
 */
export function syncFunnelFromState(
  status: TrackerStatus | null,
  matchCount: number,
  taggedOpponentCount: number,
  nowMs = Date.now(),
): FunnelSnapshot {
  if (!status) return readFunnelMilestones();
  if (status.logFound && status.detailedLogs !== false) {
    recordFunnelMilestone("log", nowMs);
  }
  if (matchCount > 0) {
    recordFunnelMilestone("match", nowMs);
    if (status.logFound && status.detailedLogs !== false) {
      recordFunnelMilestone("live", nowMs);
    }
  }
  if (taggedOpponentCount > 0) {
    recordFunnelMilestone("tag", nowMs);
  }
  return readFunnelMilestones();
}
