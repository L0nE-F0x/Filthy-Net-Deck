/**
 * Opt-in parser-health ping — Phase 2 slice 0.
 * Design: `docs/BACKEND-PHASE-2.md` §7.1.
 *
 * Two jobs, in priority order:
 *  1. Detect a broken log parser across the population within hours, instead of
 *     via a bad review. The Arena log format is unofficial and can change
 *     without notice; when it does, tracking silently dies for everyone at once.
 *  2. Count true unique installs. `/updater/latest.json` hits cannot tell 325
 *     people once from 15 people twenty times.
 *
 * Off by default. Sends the fields in `HealthPing` and nothing else — no decks,
 * no match detail, no opponents, no Arena username, no file paths.
 */

import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../appUpdater";
import { APP_VERSION } from "../../version";
import { detectOs } from "../platform";
import type { TrackedMatch, TrackerStatus } from "../../types/tracker";
import { cloudConfigured, functionUrl, SUPABASE_PUBLISHABLE_KEY } from "./config";

/**
 * Bump when `tracker.rs` parsing changes shape. Lets a spike in `parseErrors`
 * be attributed to a specific parser rather than just "some version".
 */
export const PARSER_VERSION = "1";

const LAST_SENT_KEY = "bbi.health.lastSentDay";

export interface HealthPing {
  installId: string;
  appVersion: string;
  parserVersion: string;
  os: string;
  logFound: boolean;
  detailedLogs: boolean | null;
  parseErrors: number;
  matchesLast24h: number;
}

/** `YYYY-MM-DD` in local time — the once-per-day key. */
export function dayKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Matches whose `endedAt` falls inside the last 24h. */
export function countMatchesLast24h(
  matches: readonly TrackedMatch[],
  now = Date.now(),
): number {
  const cutoff = now - 24 * 60 * 60 * 1000;
  let n = 0;
  for (const m of matches) if (m.endedAt >= cutoff && m.endedAt <= now) n++;
  return n;
}


/**
 * Assemble the payload. Exported for tests and so the Settings screen can show
 * the user exactly what would be sent — the consent copy is generated from the
 * same object, so it cannot drift from reality.
 */
export function buildPing(
  installId: string,
  status: TrackerStatus | null,
  matches: readonly TrackedMatch[],
  now = Date.now(),
): HealthPing {
  return {
    installId,
    appVersion: APP_VERSION,
    parserVersion: PARSER_VERSION,
    os: detectOs(),
    logFound: status?.logFound ?? false,
    detailedLogs: status?.detailedLogs ?? null,
    parseErrors: status?.parseErrors ?? 0,
    matchesLast24h: countMatchesLast24h(matches, now),
  };
}

/** True when today's ping has not been sent yet on this machine. */
export function shouldSendToday(now = new Date()): boolean {
  try {
    return localStorage.getItem(LAST_SENT_KEY) !== dayKey(now);
  } catch {
    return false; // no storage → don't risk pinging on every launch
  }
}

function markSent(now = new Date()) {
  try {
    localStorage.setItem(LAST_SENT_KEY, dayKey(now));
  } catch {
    /* best effort */
  }
}

/**
 * Send at most one ping per day. Never throws, never retries — this must never
 * affect app behaviour or startup, so every failure path is a silent no-op and
 * the next launch simply tries again.
 */
export async function maybeSendHealthPing(opts: {
  enabled: boolean;
  status: TrackerStatus | null;
  matches: readonly TrackedMatch[];
}): Promise<"sent" | "skipped" | "failed"> {
  if (!opts.enabled || !cloudConfigured() || !isTauri()) return "skipped";
  if (!shouldSendToday()) return "skipped";

  try {
    const installId = await invoke<string>("install_id_ensure");
    if (!installId) return "skipped";
    const body = buildPing(installId, opts.status, opts.matches);

    const res = await fetch(functionUrl("health-ping"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return "failed";
    // Only mark on success, so a backend outage doesn't cost a day of coverage.
    markSent();
    return "sent";
  } catch {
    return "failed";
  }
}

/**
 * Opting out must be a real reset, not a paused upload: drop the local id so
 * re-enabling mints a fresh one, and clear the day marker.
 */
export async function forgetInstall(): Promise<void> {
  try {
    localStorage.removeItem(LAST_SENT_KEY);
  } catch {
    /* ignore */
  }
  if (!isTauri()) return;
  try {
    await invoke("install_id_clear");
  } catch {
    /* ignore */
  }
}
