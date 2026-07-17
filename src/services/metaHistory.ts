/**
 * Compact meta-share history: pure aggregation + optional network load.
 * Pipeline writes website/meta/history.json; the app charts the last N days.
 */

export interface HistoryPoint {
  date: string;
  format: string;
  mode: "bo1" | "bo3";
  archetype: string;
  pct: number;
}

export interface HistoryBundle {
  updated: string;
  points: HistoryPoint[];
}

export interface SeriesPoint {
  date: string;
  pct: number;
}

/** Cap retained days so the file stays small. */
export const HISTORY_MAX_DAYS = 45;

/**
 * Merge one day's ranked board into an existing history.
 * Replaces any prior points for the same date+format+mode.
 */
export function mergeHistoryDay(
  existing: HistoryPoint[],
  date: string,
  rows: Omit<HistoryPoint, "date">[],
  maxDays = HISTORY_MAX_DAYS,
): HistoryPoint[] {
  const keep = existing.filter(
    (p) =>
      !(
        p.date === date &&
        rows.some((r) => r.format === p.format && r.mode === p.mode)
      ),
  );
  const added: HistoryPoint[] = rows.map((r) => ({
    date,
    format: r.format,
    mode: r.mode,
    archetype: r.archetype,
    pct: Number(r.pct) || 0,
  }));
  const merged = [...keep, ...added];
  const dates = [...new Set(merged.map((p) => p.date))].sort();
  const dropBefore =
    dates.length > maxDays ? dates[dates.length - maxDays] : null;
  if (!dropBefore) return merged.sort(byDateThenName);
  return merged.filter((p) => p.date >= dropBefore!).sort(byDateThenName);
}

function byDateThenName(a: HistoryPoint, b: HistoryPoint): number {
  return (
    a.date.localeCompare(b.date) ||
    a.format.localeCompare(b.format) ||
    a.mode.localeCompare(b.mode) ||
    a.archetype.localeCompare(b.archetype)
  );
}

/** 30-day (or N-day) share series for one archetype. */
export function seriesForArchetype(
  points: HistoryPoint[],
  opts: {
    format: string;
    mode: "bo1" | "bo3";
    archetype: string;
    days?: number;
  },
): SeriesPoint[] {
  const days = opts.days ?? 30;
  const name = opts.archetype.trim().toLowerCase();
  const filtered = points
    .filter(
      (p) =>
        p.format === opts.format &&
        p.mode === opts.mode &&
        p.archetype.trim().toLowerCase() === name,
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!filtered.length) return [];
  const lastDate = filtered[filtered.length - 1].date;
  const cutoffMs =
    new Date(`${lastDate}T12:00:00Z`).getTime() - (days - 1) * 86400000;
  return filtered
    .filter((p) => new Date(`${p.date}T12:00:00Z`).getTime() >= cutoffMs)
    .map((p) => ({ date: p.date, pct: p.pct }));
}

/** Top movers by absolute pct change over the window (end − start). */
export function topMovers(
  points: HistoryPoint[],
  opts: { format: string; mode: "bo1" | "bo3"; limit?: number },
): { archetype: string; from: number; to: number; delta: number }[] {
  const byName = new Map<string, HistoryPoint[]>();
  for (const p of points) {
    if (p.format !== opts.format || p.mode !== opts.mode) continue;
    const list = byName.get(p.archetype) ?? [];
    list.push(p);
    byName.set(p.archetype, list);
  }
  const movers: { archetype: string; from: number; to: number; delta: number }[] =
    [];
  for (const [archetype, list] of byName) {
    const sorted = list.slice().sort((a, b) => a.date.localeCompare(b.date));
    if (sorted.length < 2) continue;
    const from = sorted[0].pct;
    const to = sorted[sorted.length - 1].pct;
    movers.push({ archetype, from, to, delta: to - from });
  }
  movers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return movers.slice(0, opts.limit ?? 8);
}

const DEFAULT_BASE = "https://filthy-net-deck.netlify.app";

export async function fetchMetaHistory(
  baseUrl = DEFAULT_BASE,
): Promise<HistoryBundle | null> {
  const url = `${baseUrl.replace(/\/$/, "")}/meta/history.json?t=${Date.now()}`;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as HistoryBundle;
    if (!Array.isArray(data?.points)) return null;
    return data;
  } catch {
    return null;
  }
}
