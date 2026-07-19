/**
 * Keep the Events page focused on recent, useful tournaments.
 * Melee (and occasional other sources) can ship ancient rows; we drop them.
 */

export const EVENT_MAX_AGE_DAYS = 120;

/** ISO date (YYYY-MM-DD) → days ago at local noon, or null if unparseable. */
export function daysSinceEvent(iso: string, nowMs: number = Date.now()): number | null {
  const t = new Date(`${String(iso).slice(0, 10)}T12:00:00`).getTime();
  if (Number.isNaN(t)) return null;
  return Math.round((nowMs - t) / 86400000);
}

/**
 * True when the event date is parseable and within maxAgeDays (inclusive).
 * Missing / garbage dates fail closed (stale) so junk never surfaces.
 */
export function isFreshEventDate(
  iso: string | undefined | null,
  opts: { nowMs?: number; maxAgeDays?: number } = {},
): boolean {
  if (!iso) return false;
  const days = daysSinceEvent(iso, opts.nowMs ?? Date.now());
  if (days == null) return false;
  // Future-dated (clock skew / TBD) — keep if within a week ahead.
  if (days < -7) return false;
  return days <= (opts.maxAgeDays ?? EVENT_MAX_AGE_DAYS);
}

export function filterFreshTournaments<T extends { date: string }>(
  rows: T[],
  opts: { nowMs?: number; maxAgeDays?: number } = {},
): T[] {
  return rows.filter((t) => isFreshEventDate(t.date, opts));
}
