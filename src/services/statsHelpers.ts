/**
 * Pure Stats page helpers — peeled from Stats.tsx so they stay unit-tested
 * and reusable (form tiles, arsenal, rolling WR).
 */

import type { TrackedMatch } from "../types/tracker";

export interface MatchTally {
  wins: number;
  losses: number;
  decided: number;
  rate: number | null;
}

export function tallyMatches(matches: TrackedMatch[]): MatchTally {
  const wins = matches.filter((m) => m.result === "win").length;
  const losses = matches.filter((m) => m.result === "loss").length;
  const decided = wins + losses;
  return { wins, losses, decided, rate: decided > 0 ? wins / decided : null };
}

/** Local calendar-day equality for "today" tiles. */
export function isSameLocalDay(ms: number, nowMs = Date.now()): boolean {
  const d = new Date(ms);
  const now = new Date(nowMs);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/**
 * Rolling win rate over the last `window` decided matches at each point in
 * chronological time. Returns one rate per decided match (oldest → newest).
 */
export function rollingWinrate(
  matches: TrackedMatch[],
  window = 10,
): number[] {
  const decided = [...matches]
    .filter((m) => m.result === "win" || m.result === "loss")
    .sort((a, b) => a.endedAt - b.endedAt);
  const out: number[] = [];
  for (let i = 0; i < decided.length; i++) {
    const slice = decided.slice(Math.max(0, i - window + 1), i + 1);
    const wins = slice.filter((m) => m.result === "win").length;
    out.push(wins / slice.length);
  }
  return out;
}

/**
 * Best/worst N-match stretch WR in chronological decided history.
 * Requires at least `window` decided matches.
 */
export function formExtremes(
  matches: TrackedMatch[],
  window = 10,
): {
  best: { rate: number; wins: number; losses: number } | null;
  worst: { rate: number; wins: number; losses: number } | null;
} {
  const decided = [...matches]
    .filter((m) => m.result === "win" || m.result === "loss")
    .sort((a, b) => a.endedAt - b.endedAt);
  if (decided.length < window) {
    return { best: null, worst: null };
  }
  let best: { rate: number; wins: number; losses: number } | null = null;
  let worst: { rate: number; wins: number; losses: number } | null = null;
  for (let i = window - 1; i < decided.length; i++) {
    const slice = decided.slice(i - window + 1, i + 1);
    const wins = slice.filter((m) => m.result === "win").length;
    const losses = window - wins;
    const rate = wins / window;
    if (!best || rate > best.rate) best = { rate, wins, losses };
    if (!worst || rate < worst.rate) worst = { rate, wins, losses };
  }
  return { best, worst };
}
