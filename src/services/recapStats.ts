/**
 * Pure week/season recap stats for shareable PNG cards.
 */

import type { MatchResult, TrackedMatch } from "../types/tracker";
import { deckKey } from "./tracker";
import { parseRank } from "./ranks";

export interface RecapDeckLine {
  key: string;
  name: string;
  wins: number;
  losses: number;
  games: number;
  winrate: number;
}

export interface RecapStats {
  fromMs: number;
  toMs: number;
  wins: number;
  losses: number;
  draws: number;
  games: number;
  winrate: number;
  bestDeck: RecapDeckLine | null;
  worstDeck: RecapDeckLine | null;
  startRank: string | null;
  endRank: string | null;
  rankDeltaLabel: string | null;
}

function isDecisive(r: MatchResult): r is "win" | "loss" {
  return r === "win" || r === "loss";
}

/** Aggregate matches in [fromMs, toMs] inclusive. */
export function buildRecapStats(
  matches: TrackedMatch[],
  fromMs: number,
  toMs: number,
): RecapStats {
  const window = matches
    .filter((m) => m.endedAt >= fromMs && m.endedAt <= toMs)
    .slice()
    .sort((a, b) => a.endedAt - b.endedAt);

  let wins = 0;
  let losses = 0;
  let draws = 0;
  const byDeck = new Map<string, RecapDeckLine>();

  for (const m of window) {
    if (m.result === "win") wins++;
    else if (m.result === "loss") losses++;
    else if (m.result === "draw") draws++;

    if (!isDecisive(m.result)) continue;
    const key = deckKey(m);
    const name = m.deckName?.trim() || "Unknown deck";
    const row = byDeck.get(key) ?? {
      key,
      name,
      wins: 0,
      losses: 0,
      games: 0,
      winrate: 0,
    };
    if (m.result === "win") row.wins++;
    else row.losses++;
    row.games = row.wins + row.losses;
    row.winrate = row.games ? row.wins / row.games : 0;
    if (m.deckName?.trim()) row.name = m.deckName.trim();
    byDeck.set(key, row);
  }

  const decks = [...byDeck.values()].filter((d) => d.games >= 2);
  decks.sort((a, b) => b.winrate - a.winrate || b.games - a.games);
  const bestDeck = decks[0] ?? null;
  const worstDeck =
    decks.length > 1 ? decks[decks.length - 1] : decks.length === 1 ? null : null;

  const withRank = window.filter((m) => m.myRank);
  const startRank = withRank[0]?.myRank ?? null;
  const endRank = withRank[withRank.length - 1]?.myRank ?? null;
  let rankDeltaLabel: string | null = null;
  if (startRank && endRank) {
    const a = parseRank(startRank);
    const b = parseRank(endRank);
    if (a && b) {
      const d = b.score - a.score;
      if (Math.abs(d) < 0.01) rankDeltaLabel = "rank held";
      else if (d > 0) rankDeltaLabel = `${startRank} → ${endRank}`;
      else rankDeltaLabel = `${startRank} → ${endRank}`;
    } else {
      rankDeltaLabel = `${startRank} → ${endRank}`;
    }
  }

  const games = wins + losses + draws;
  const decisive = wins + losses;
  return {
    fromMs,
    toMs,
    wins,
    losses,
    draws,
    games,
    winrate: decisive ? wins / decisive : 0,
    bestDeck,
    worstDeck,
    startRank,
    endRank,
    rankDeltaLabel,
  };
}

/** Default window: last 7 calendar days ending now. */
export function lastSevenDaysWindow(nowMs = Date.now()): {
  fromMs: number;
  toMs: number;
} {
  const toMs = nowMs;
  const fromMs = nowMs - 7 * 86400000;
  return { fromMs, toMs };
}

/** Local calendar day: midnight this morning → now. */
export function dayWindow(nowMs = Date.now()): { fromMs: number; toMs: number } {
  const d = new Date(nowMs);
  const fromMs = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return { fromMs, toMs: nowMs };
}

/**
 * The most recent play session: walk back from the latest recorded match,
 * keeping matches while the gap to the previous one stays under `gapMs`
 * (default 3h). Returns [nowMs, nowMs] when there are no matches.
 */
export function sessionWindow(
  matches: TrackedMatch[],
  nowMs = Date.now(),
  gapMs = 3 * 3600_000,
): { fromMs: number; toMs: number } {
  const sorted = matches
    .filter((m) => m.endedAt > 0)
    .slice()
    .sort((a, b) => a.endedAt - b.endedAt);
  if (!sorted.length) return { fromMs: nowMs, toMs: nowMs };

  let start = sorted.length - 1;
  for (let i = sorted.length - 1; i > 0; i--) {
    if (sorted[i].endedAt - sorted[i - 1].endedAt <= gapMs) start = i - 1;
    else break;
  }
  const first = sorted[start];
  return {
    fromMs: first.startedAt > 0 ? first.startedAt : first.endedAt,
    toMs: sorted[sorted.length - 1].endedAt,
  };
}

export function formatRecapHeadline(s: RecapStats): string {
  if (s.games === 0) return "No matches this week";
  const pct = Math.round(s.winrate * 100);
  return `This week: ${pct}% WR · ${s.wins}–${s.losses}`;
}
