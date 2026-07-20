/**
 * Local-only open-day counters for retention (day-2 / day-7 style).
 * Never uploaded — privacy-safe instrumentation for the pilot and future
 * opt-in aggregate reporting if we ever add it.
 */

const KEY = "bbi.retention.v1";

export interface RetentionState {
  /** Distinct local calendar days (YYYY-MM-DD) the app was opened. */
  openDays: string[];
  firstOpenMs: number | null;
  lastOpenMs: number | null;
}

function dayKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function readRetentionState(): RetentionState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return { openDays: [], firstOpenMs: null, lastOpenMs: null };
    }
    const parsed = JSON.parse(raw) as Partial<RetentionState>;
    return {
      openDays: Array.isArray(parsed.openDays)
        ? parsed.openDays.filter((x): x is string => typeof x === "string")
        : [],
      firstOpenMs:
        typeof parsed.firstOpenMs === "number" ? parsed.firstOpenMs : null,
      lastOpenMs:
        typeof parsed.lastOpenMs === "number" ? parsed.lastOpenMs : null,
    };
  } catch {
    return { openDays: [], firstOpenMs: null, lastOpenMs: null };
  }
}

function writeRetentionState(state: RetentionState): void {
  try {
    // Cap history so the blob stays tiny.
    const openDays = state.openDays.slice(-120);
    localStorage.setItem(
      KEY,
      JSON.stringify({ ...state, openDays }),
    );
  } catch {
    /* ignore */
  }
}

/** Record an app open on the local calendar day. Idempotent per day. */
export function recordAppOpen(nowMs = Date.now()): RetentionState {
  const state = readRetentionState();
  const key = dayKey(nowMs);
  if (!state.openDays.includes(key)) {
    state.openDays = [...state.openDays, key];
  }
  if (state.firstOpenMs == null) state.firstOpenMs = nowMs;
  state.lastOpenMs = nowMs;
  writeRetentionState(state);
  return state;
}

/**
 * Snapshot against first open: did we open again on day 2 / day 7
 * (calendar-day distance), and how many distinct open days total.
 */
export function retentionSnapshot(
  state: RetentionState = readRetentionState(),
  nowMs = Date.now(),
): {
  openDayCount: number;
  day2: boolean;
  day7: boolean;
  daysSinceFirst: number | null;
} {
  const openDayCount = state.openDays.length;
  if (state.firstOpenMs == null) {
    return { openDayCount: 0, day2: false, day7: false, daysSinceFirst: null };
  }
  const firstDay = dayKey(state.firstOpenMs);
  const firstMs = Date.parse(`${firstDay}T12:00:00`);
  const nowDay = dayKey(nowMs);
  const nowNoon = Date.parse(`${nowDay}T12:00:00`);
  const daysSinceFirst = Math.max(
    0,
    Math.round((nowNoon - firstMs) / 86400000),
  );
  const hasDay = (offset: number) => {
    const d = new Date(firstMs + offset * 86400000);
    return state.openDays.includes(dayKey(d.getTime()));
  };
  // day-2 = opened on first day and again at least one later day within 2 calendar days
  // Practical: at least 2 distinct open days and first open was ≥1 day ago.
  const day2 = openDayCount >= 2 && daysSinceFirst >= 1;
  const day7 = openDayCount >= 2 && (hasDay(7) || (daysSinceFirst >= 7 && openDayCount >= 3));
  return { openDayCount, day2, day7, daysSinceFirst };
}
