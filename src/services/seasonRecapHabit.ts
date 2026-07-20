/**
 * D2-b — end-of-season recap as a habit (local, no cloud).
 * Detect a closed season with enough play, nudge once via banner + optional
 * desktop notification, then seed A5 climb share.
 */

import type { TrackedMatch } from "../types/tracker";
import {
  seasonSummaries,
  type SeasonSummary,
} from "./climbStats";
import { rankLabelFromScore } from "./ranks";
import { currentSeasonKey, seasonLabel } from "./tracker";

const DISMISSED_KEY = "bbi.seasonRecap.dismissed";
const NOTIFIED_KEY = "bbi.seasonRecap.notified";

/** Minimum decided games before we bother nudging a season recap. */
export const SEASON_RECAP_MIN_GAMES = 5;

function readStringSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function writeStringSet(key: string, set: Set<string>): void {
  try {
    localStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

export function readDismissedSeasonRecaps(): Set<string> {
  return readStringSet(DISMISSED_KEY);
}

export function readNotifiedSeasonRecaps(): Set<string> {
  return readStringSet(NOTIFIED_KEY);
}

export function dismissSeasonRecap(seasonKey: string): void {
  const s = readDismissedSeasonRecaps();
  s.add(seasonKey);
  writeStringSet(DISMISSED_KEY, s);
}

export function markSeasonRecapNotified(seasonKey: string): void {
  const s = readNotifiedSeasonRecaps();
  s.add(seasonKey);
  writeStringSet(NOTIFIED_KEY, s);
}

/**
 * Most recent *closed* season with enough games that the pilot hasn't dismissed.
 * Current calendar season is never nudged (it's still live).
 */
export function pickSeasonRecapNudge(
  matches: TrackedMatch[],
  opts?: {
    currentKey?: string;
    dismissed?: Set<string>;
    minGames?: number;
  },
): SeasonSummary | null {
  const currentKey = opts?.currentKey ?? currentSeasonKey();
  const dismissed = opts?.dismissed ?? readDismissedSeasonRecaps();
  const minGames = opts?.minGames ?? SEASON_RECAP_MIN_GAMES;
  const all = seasonSummaries(matches);
  for (const s of all) {
    if (s.seasonKey === currentKey) continue;
    if (s.games < minGames) continue;
    if (dismissed.has(s.seasonKey)) continue;
    return s;
  }
  return null;
}

/** Whether we should fire a one-shot OS notification for this nudge. */
export function shouldNotifySeasonRecap(
  nudge: SeasonSummary | null,
  notified?: Set<string>,
): boolean {
  if (!nudge) return false;
  const set = notified ?? readNotifiedSeasonRecaps();
  return !set.has(nudge.seasonKey);
}

export function seasonRecapHeadline(s: SeasonSummary): string {
  const label = seasonLabel(s.seasonKey);
  const wr =
    s.rate != null ? `${Math.round(s.rate * 100)}%` : `${s.wins}–${s.losses}`;
  return `${label} recap ready · ${wr}`;
}

export function seasonRecapBody(s: SeasonSummary): string {
  const bits = [
    `${s.wins}–${s.losses} across ${s.games} games`,
    s.peakScore != null ? `peak ${rankLabelFromScore(s.peakScore)}` : null,
  ].filter(Boolean);
  return `${bits.join(" · ")}. Open Climb to share your story.`;
}

export function seasonRecapNotifyCopy(s: SeasonSummary): {
  title: string;
  body: string;
} {
  return {
    title: `Filthy Net Deck · ${seasonLabel(s.seasonKey)} climb`,
    body: seasonRecapBody(s),
  };
}
