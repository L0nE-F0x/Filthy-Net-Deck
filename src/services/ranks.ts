/**
 * Arena constructed rank parsing + climb estimates.
 * Labels look like "Diamond 1", "Platinum 3", "Mythic", "Mythic 82%",
 * "Mythic 93.4%", or "Mythic #874" (leaderboard place, top ~1200).
 */

export type RankTier =
  | "Bronze"
  | "Silver"
  | "Gold"
  | "Platinum"
  | "Diamond"
  | "Mythic";

export interface ParsedRank {
  raw: string;
  tier: RankTier;
  /** 4 = lowest in tier, 1 = highest (undefined for Mythic). */
  division?: number;
  /** Mythic percentile 0–100 when present. */
  mythicPct?: number;
  /** Mythic leaderboard place (1 = best) when present — beats percentile. */
  mythicPlace?: number;
  /**
   * Monotonic score for graphing. Higher = better.
   * Bronze 4 = 0 … Diamond 1 = 19, Mythic base = 20, + pct/100 (20–21).
   * Leaderboard Mythic maps to 21–22 (place 1200 → 21, place 1 → ~22).
   */
  score: number;
}

/** Arena's Mythic leaderboard covers roughly the top 1200 players. */
const MYTHIC_LEADERBOARD_SIZE = 1200;

const TIERS: RankTier[] = [
  "Bronze",
  "Silver",
  "Gold",
  "Platinum",
  "Diamond",
  "Mythic",
];

const TIER_RE = /^(Bronze|Silver|Gold|Platinum|Diamond|Mythic)\b/i;

export function parseRank(raw: string | undefined | null): ParsedRank | null {
  if (!raw?.trim()) return null;
  const s = raw.trim();
  const m = s.match(TIER_RE);
  if (!m) return null;
  const tier = (m[1][0].toUpperCase() + m[1].slice(1).toLowerCase()) as RankTier;
  if (!TIERS.includes(tier)) return null;

  if (tier === "Mythic") {
    const placeMatch = s.match(/#\s*(\d+)/);
    if (placeMatch) {
      const mythicPlace = Math.max(1, Number(placeMatch[1]));
      const clamped = Math.min(MYTHIC_LEADERBOARD_SIZE, mythicPlace);
      const score = 21 + (1 - clamped / MYTHIC_LEADERBOARD_SIZE);
      return { raw: s, tier, mythicPlace, score };
    }
    const pctMatch = s.match(/(\d+(?:\.\d+)?)\s*%/);
    const mythicPct = pctMatch ? Math.min(100, Math.max(0, Number(pctMatch[1]))) : undefined;
    const score = 20 + (mythicPct != null ? mythicPct / 100 : 0);
    return { raw: s, tier, mythicPct, score };
  }

  const divMatch = s.match(/\b([1-4])\b/);
  const division = divMatch ? Number(divMatch[1]) : 4;
  const tierIndex = TIERS.indexOf(tier); // 0..4 for non-mythic
  // Bronze 4 → 0, Bronze 1 → 3, Silver 4 → 4, … Diamond 1 → 19
  const score = tierIndex * 4 + (4 - division);
  return { raw: s, tier, division, score };
}

export function formatRank(p: ParsedRank): string {
  if (p.tier === "Mythic") {
    if (p.mythicPlace != null) return `Mythic #${p.mythicPlace}`;
    return p.mythicPct != null ? `Mythic ${Math.round(p.mythicPct)}%` : "Mythic";
  }
  return `${p.tier} ${p.division ?? 4}`;
}

/** Human label for a score step, e.g. 18 → "Diamond 2". */
export function rankLabelFromScore(score: number): string {
  if (score >= 21) {
    const place = Math.max(
      1,
      Math.round((1 - (score - 21)) * MYTHIC_LEADERBOARD_SIZE),
    );
    return `Mythic #${place}`;
  }
  if (score >= 20) {
    const pct = Math.round((score - 20) * 100);
    return pct > 0 ? `Mythic ${pct}%` : "Mythic";
  }
  const clamped = Math.max(0, Math.min(19, Math.floor(score)));
  const tier = TIERS[Math.floor(clamped / 4)] as RankTier;
  const division = 4 - (clamped % 4);
  return `${tier} ${division}`;
}

/**
 * Axis label for the all-Mythic climb chart, with enough precision to keep
 * neighboring ticks distinct when the whole range is a few percent.
 */
export function mythicAxisLabel(score: number, spanScore: number): string {
  if (score >= 21) {
    const place = Math.max(
      1,
      Math.round((1 - (score - 21)) * MYTHIC_LEADERBOARD_SIZE),
    );
    return `#${place}`;
  }
  const pct = (score - 20) * 100;
  const decimals = spanScore * 100 < 4 ? 1 : 0;
  return `${pct.toFixed(decimals)}%`;
}

/**
 * Y-axis domain for a rank series.
 *
 * Mythic movement lives inside the 20–22 band: a percentile point is 0.01 of
 * a score, so a whole session of climbing spans hundredths. Any fixed minimum
 * span sized for the tier scale (where one division = 1.0) squashes that to a
 * flat line — which is exactly what the post-match sparkline used to draw for
 * anyone in Mythic. Zoom into the band whenever every sample is Mythic.
 *
 * Shared by the Climb chart and the overlay sparkline so the two can't drift.
 */
export function rankSeriesDomain(scores: number[]): { lo: number; hi: number } {
  if (!scores.length) return { lo: 0, hi: 1 };
  const minS = Math.min(...scores);
  const maxS = Math.max(...scores);
  if (minS >= 20) {
    const pad = Math.max(0.01, (maxS - minS) * 0.15);
    let lo = Math.max(20, minS - pad);
    let hi = Math.min(22, maxS + pad);
    if (hi - lo < 0.05) {
      const mid = (lo + hi) / 2;
      lo = Math.max(20, mid - 0.025);
      hi = Math.min(22, lo + 0.05);
    }
    return { lo, hi };
  }
  let lo = Math.floor(minS);
  let hi = Math.ceil(maxS);
  if (hi - lo < 2) {
    lo = Math.max(0, lo - 1);
    hi = lo + 2;
  }
  return { lo, hi };
}

/** Next discrete step above this rank (Mythic stays Mythic). */
export function nextRankLabel(p: ParsedRank): string | null {
  if (p.tier === "Mythic") return null;
  const next = Math.min(20, Math.floor(p.score) + 1);
  return rankLabelFromScore(next);
}

export interface RankPoint {
  at: number;
  rank: ParsedRank;
  matchId: string;
  /** Stable tracker deck key when known (for climb-by-deck chart). */
  deckKey?: string;
  deckName?: string;
  result?: string;
}

/** Chronological rank samples from matches that recorded myRank. */
export function buildRankSeries(
  matches: {
    endedAt: number;
    matchId: string;
    myRank?: string;
    deckKey?: string;
    deckName?: string;
    result?: string;
  }[],
): RankPoint[] {
  const asc = [...matches].sort((a, b) => a.endedAt - b.endedAt);
  const out: RankPoint[] = [];
  for (const m of asc) {
    const rank = parseRank(m.myRank);
    if (!rank) continue;
    out.push({
      at: m.endedAt,
      rank,
      matchId: m.matchId,
      deckKey: m.deckKey,
      deckName: m.deckName,
      result: m.result,
    });
  }
  return out;
}

/**
 * Estimate matches needed to gain one rank step, from recent history.
 * Falls back to a conservative default when we lack rank transitions.
 */
export function estimateMatchesPerStep(
  matches: { endedAt: number; matchId: string; result: string; myRank?: string }[],
): { matchesPerStep: number; source: "history" | "default" } {
  const series = buildRankSeries(matches);
  if (series.length < 2) {
    return { matchesPerStep: 5, source: "default" };
  }

  // Count decided matches between first and last rank sample, vs net steps gained.
  const first = series[0];
  const last = series[series.length - 1];
  const netSteps = last.rank.score - first.rank.score;
  if (netSteps <= 0.25) {
    // Not climbing — use win rate heuristic.
    const window = matches.filter(
      (m) => m.endedAt >= first.at && m.endedAt <= last.at,
    );
    const wins = window.filter((m) => m.result === "win").length;
    const losses = window.filter((m) => m.result === "loss").length;
    const decided = wins + losses;
    if (decided < 5) return { matchesPerStep: 6, source: "default" };
    const wr = wins / decided;
    // Rough: at 55% you need ~9 matches/step, at 65% ~5, at 50% ~12.
    const mps = wr <= 0.5 ? 14 : Math.max(3, Math.round(2.5 / (wr - 0.45)));
    return { matchesPerStep: mps, source: "default" };
  }

  const window = matches.filter((m) => m.endedAt >= first.at && m.endedAt <= last.at);
  const decided = window.filter((m) => m.result === "win" || m.result === "loss").length;
  if (decided < 3) return { matchesPerStep: 5, source: "default" };
  const mps = Math.max(2, Math.round(decided / netSteps));
  return { matchesPerStep: mps, source: "history" };
}

export function winrateFavor(rate: number): "favored" | "even" | "unfavored" {
  if (rate >= 0.55) return "favored";
  if (rate >= 0.45) return "even";
  return "unfavored";
}
