/**
 * Session wrap — detect a finished ladder block and package a shareable summary.
 * Local only; pure helpers.
 */

import type { TrackedMatch } from "../types/tracker";
import { sessionWindow, buildRecapStats, type RecapStats } from "./recapStats";
import { deckKey } from "./tracker";

const DISMISS_KEY = "bbi.sessionWrap.dismissed";

export interface SessionWrap {
  fromMs: number;
  toMs: number;
  stats: RecapStats;
  /** Best deck in the session (if any with ≥2 games). */
  bestDeckName: string | null;
  matchCount: number;
}

/**
 * Build a session wrap when the latest session has enough decided games and
 * has been idle for `idleMs` (default 20 min) — or when force=true.
 */
export function buildSessionWrap(
  matches: TrackedMatch[],
  nowMs = Date.now(),
  opts?: { minDecided?: number; idleMs?: number; gapMs?: number; force?: boolean },
): SessionWrap | null {
  const minDecided = opts?.minDecided ?? 3;
  const idleMs = opts?.idleMs ?? 20 * 60_000;
  const gapMs = opts?.gapMs ?? 3 * 3600_000;
  const w = sessionWindow(matches, nowMs, gapMs);
  if (w.fromMs === w.toMs && matches.length === 0) return null;

  const sessionMatches = matches.filter(
    (m) => m.endedAt >= w.fromMs && m.endedAt <= w.toMs,
  );
  const decided = sessionMatches.filter(
    (m) => m.result === "win" || m.result === "loss",
  );
  if (decided.length < minDecided) return null;

  const latest = Math.max(...sessionMatches.map((m) => m.endedAt));
  if (!opts?.force && nowMs - latest < idleMs) return null;

  const stats = buildRecapStats(matches, w.fromMs, w.toMs);

  // Best deck by WR (≥2 decided)
  const byDeck = new Map<string, { name: string; w: number; l: number }>();
  for (const m of decided) {
    const k = deckKey(m);
    const row = byDeck.get(k) ?? {
      name: m.deckName?.trim() || "Unknown deck",
      w: 0,
      l: 0,
    };
    if (m.result === "win") row.w++;
    else row.l++;
    if (m.deckName?.trim()) row.name = m.deckName.trim();
    byDeck.set(k, row);
  }
  let bestDeckName: string | null = null;
  let bestRate = -1;
  for (const r of byDeck.values()) {
    const n = r.w + r.l;
    if (n < 2) continue;
    const rate = r.w / n;
    if (rate > bestRate) {
      bestRate = rate;
      bestDeckName = r.name;
    }
  }

  return {
    fromMs: w.fromMs,
    toMs: w.toMs,
    stats,
    bestDeckName,
    matchCount: sessionMatches.length,
  };
}

export function sessionWrapHeadline(w: SessionWrap): string {
  const s = w.stats;
  const wr = s.wins + s.losses ? Math.round((s.wins / (s.wins + s.losses)) * 100) : null;
  const rec = wr != null ? `${s.wins}–${s.losses} (${wr}%)` : `${s.wins}–${s.losses}`;
  return `Session wrap · ${rec}`;
}

export function sessionWrapBody(w: SessionWrap): string {
  const bits = [
    `${w.matchCount} match${w.matchCount === 1 ? "" : "es"} this block`,
    w.bestDeckName ? `best: ${w.bestDeckName}` : null,
    w.stats.rankDeltaLabel,
  ].filter(Boolean);
  return bits.join(" · ");
}

export function sessionWrapDismissKey(w: SessionWrap): string {
  return `${w.fromMs}-${w.toMs}-${w.stats.wins}-${w.stats.losses}`;
}

export function isSessionWrapDismissed(key: string): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) && arr.includes(key);
  } catch {
    return false;
  }
}

export function dismissSessionWrap(key: string): void {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    let arr: string[] = [];
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) arr = parsed.filter((x): x is string => typeof x === "string");
    }
    if (!arr.includes(key)) arr.push(key);
    localStorage.setItem(DISMISS_KEY, JSON.stringify(arr.slice(-30)));
  } catch {
    /* ignore */
  }
}
