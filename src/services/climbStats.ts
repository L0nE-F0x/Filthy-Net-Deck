/**
 * Climb polish helpers — win/loss streaks, season-over-season, and
 * path-by-deck (which deck carried each stretch of the climb).
 * Pure functions over TrackedMatch, so they're unit-testable and reusable.
 *
 * Match order convention: the store keeps matches newest-first. These helpers
 * accept whatever order and sort internally where order matters.
 */
import type { TrackedMatch } from "../types/tracker";
import { parseRank, type ParsedRank } from "./ranks";
import { deckKey, seasonKeyOf } from "./tracker";

export interface Streak {
  type: "win" | "loss" | null;
  length: number;
}

/** Current run of same-result decided matches, ending at the latest match. */
export function currentStreak(matches: TrackedMatch[]): Streak {
  const decided = [...matches]
    .filter((m) => m.result === "win" || m.result === "loss")
    .sort((a, b) => b.endedAt - a.endedAt); // newest first
  if (!decided.length) return { type: null, length: 0 };
  const type = decided[0].result as "win" | "loss";
  let length = 0;
  for (const m of decided) {
    if (m.result === type) length++;
    else break;
  }
  return { type, length };
}

/** Longest run of the given result anywhere in the range. */
export function longestStreak(matches: TrackedMatch[], type: "win" | "loss"): number {
  const decided = [...matches]
    .filter((m) => m.result === "win" || m.result === "loss")
    .sort((a, b) => a.endedAt - b.endedAt);
  let best = 0;
  let run = 0;
  for (const m of decided) {
    if (m.result === type) {
      run++;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}

export interface SeasonSummary {
  seasonKey: string;
  games: number;
  wins: number;
  losses: number;
  rate: number | null;
  /** Best rank score reached in the season, or null when no ranks stamped. */
  peakScore: number | null;
  /** Net rank score change first→last stamped rank in the season. */
  delta: number | null;
}

function summarizeSeason(seasonKey: string, matches: TrackedMatch[]): SeasonSummary {
  const wins = matches.filter((m) => m.result === "win").length;
  const losses = matches.filter((m) => m.result === "loss").length;
  const decided = wins + losses;
  const ranked = matches
    .map((m) => ({ at: m.endedAt, rank: parseRank(m.myRank) }))
    .filter((r): r is { at: number; rank: NonNullable<ReturnType<typeof parseRank>> } =>
      r.rank != null,
    )
    .sort((a, b) => a.at - b.at);
  const peakScore = ranked.length
    ? ranked.reduce((best, r) => Math.max(best, r.rank.score), ranked[0].rank.score)
    : null;
  const delta =
    ranked.length >= 2 ? ranked[ranked.length - 1].rank.score - ranked[0].rank.score : null;
  return {
    seasonKey,
    games: matches.length,
    wins,
    losses,
    rate: decided > 0 ? wins / decided : null,
    peakScore,
    delta,
  };
}

/** Per-season summaries, most recent season first. */
export function seasonSummaries(matches: TrackedMatch[]): SeasonSummary[] {
  const bySeason = new Map<string, TrackedMatch[]>();
  for (const m of matches) {
    const k = seasonKeyOf(m.endedAt);
    const list = bySeason.get(k) ?? [];
    list.push(m);
    bySeason.set(k, list);
  }
  return [...bySeason.entries()]
    .map(([k, list]) => summarizeSeason(k, list))
    .sort((a, b) => b.seasonKey.localeCompare(a.seasonKey));
}

/**
 * The season immediately before `seasonKey` (by calendar order), or null.
 * Used to render a "vs last season" comparison for the selected season.
 */
export function previousSeasonSummary(
  matches: TrackedMatch[],
  seasonKey: string,
): SeasonSummary | null {
  const all = seasonSummaries(matches);
  const idx = all.findIndex((s) => s.seasonKey === seasonKey);
  if (idx < 0 || idx + 1 >= all.length) return null;
  return all[idx + 1];
}

/** One continuous stretch of matches on the same deck (chronological). */
export interface ClimbLeg {
  deckKey: string;
  deckName: string;
  startAt: number;
  endAt: number;
  matches: number;
  wins: number;
  losses: number;
  rate: number | null;
  startRank: ParsedRank | null;
  endRank: ParsedRank | null;
  /** Net rank score change first→last stamped rank in this leg. */
  delta: number | null;
}

/**
 * Group season matches into consecutive "legs" on the same deck.
 * Oldest leg first — reads as a climb diary: "Platinum with A, then Diamond with B".
 */
export function buildClimbLegs(matches: TrackedMatch[]): ClimbLeg[] {
  const asc = [...matches].sort((a, b) => a.endedAt - b.endedAt);
  if (!asc.length) return [];

  type Acc = {
    deckKey: string;
    deckName: string;
    list: TrackedMatch[];
  };
  const groups: Acc[] = [];
  for (const m of asc) {
    const key = deckKey(m);
    const name = m.deckName?.trim() || "Unknown deck";
    const last = groups[groups.length - 1];
    if (last && last.deckKey === key) {
      last.list.push(m);
      if (!last.deckName || last.deckName === "Unknown deck") last.deckName = name;
    } else {
      groups.push({ deckKey: key, deckName: name, list: [m] });
    }
  }

  return groups.map((g) => {
    const wins = g.list.filter((m) => m.result === "win").length;
    const losses = g.list.filter((m) => m.result === "loss").length;
    const decided = wins + losses;
    const ranked = g.list
      .map((m) => parseRank(m.myRank))
      .filter((r): r is ParsedRank => r != null);
    const startRank = ranked[0] ?? null;
    const endRank = ranked.length ? ranked[ranked.length - 1] : null;
    const delta =
      startRank && endRank ? endRank.score - startRank.score : null;
    return {
      deckKey: g.deckKey,
      deckName: g.deckName,
      startAt: g.list[0].endedAt,
      endAt: g.list[g.list.length - 1].endedAt,
      matches: g.list.length,
      wins,
      losses,
      rate: decided > 0 ? wins / decided : null,
      startRank,
      endRank,
      delta,
    };
  });
}

export interface DeckClimbSummary {
  key: string;
  name: string;
  matches: number;
  wins: number;
  losses: number;
  rate: number | null;
  /** Net rank score change first→last ranked sample while on this deck. */
  delta: number;
  startRank: ParsedRank | null;
  endRank: ParsedRank | null;
  /** How many separate legs this deck appeared in. */
  legs: number;
  lastPlayedAt: number;
}

/** Aggregate per-deck climb contribution (all games on that deck in range). */
export function deckClimbSummaries(matches: TrackedMatch[]): DeckClimbSummary[] {
  const byDeck = new Map<string, TrackedMatch[]>();
  for (const m of matches) {
    const k = deckKey(m);
    const list = byDeck.get(k) ?? [];
    list.push(m);
    byDeck.set(k, list);
  }
  const legs = buildClimbLegs(matches);
  const legCount = new Map<string, number>();
  for (const leg of legs) {
    legCount.set(leg.deckKey, (legCount.get(leg.deckKey) ?? 0) + 1);
  }

  const out: DeckClimbSummary[] = [];
  for (const [key, list] of byDeck) {
    const wins = list.filter((m) => m.result === "win").length;
    const losses = list.filter((m) => m.result === "loss").length;
    const decided = wins + losses;
    const ranked = list
      .filter((m) => parseRank(m.myRank))
      .sort((a, b) => a.endedAt - b.endedAt);
    let delta = 0;
    let startRank: ParsedRank | null = null;
    let endRank: ParsedRank | null = null;
    if (ranked.length >= 1) {
      startRank = parseRank(ranked[0].myRank);
      endRank = parseRank(ranked[ranked.length - 1].myRank);
      if (startRank && endRank) delta = endRank.score - startRank.score;
    }
    out.push({
      key,
      name: list.find((m) => m.deckName)?.deckName ?? "Unknown deck",
      matches: list.length,
      wins,
      losses,
      rate: decided > 0 ? wins / decided : null,
      delta,
      startRank,
      endRank,
      legs: legCount.get(key) ?? 1,
      lastPlayedAt: Math.max(...list.map((m) => m.endedAt)),
    });
  }
  return out.sort(
    (a, b) =>
      b.delta - a.delta ||
      (b.rate ?? 0) - (a.rate ?? 0) ||
      b.matches - a.matches,
  );
}

/** Stable color index 0..n-1 for chart / legend swatches. */
export function deckColorIndex(deckKey: string, paletteSize: number): number {
  if (paletteSize <= 0) return 0;
  let h = 2166136261;
  for (let i = 0; i < deckKey.length; i++) {
    h ^= deckKey.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % paletteSize;
}
