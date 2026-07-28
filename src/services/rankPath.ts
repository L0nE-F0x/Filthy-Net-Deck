/**
 * Rank path for the post-match overlay card.
 *
 * The overlay card tells the story of *this run*: season/session record and
 * recent form are all scoped to the deck you just played. The sparkline was
 * not — it walked every match ever recorded, so a brand-new deck still drew a
 * twelve-point climb built from someone else's history. These are the rules
 * that keep the line honest:
 *
 *  - **Ladder queues only.** `myRank` is the *constructed* rank and gets
 *    stamped onto every match, drafts and Play-queue games included. Those
 *    never move the ladder, so plotting them padded the path with filler.
 *  - **One season.** Arena resets rank monthly; a series spanning a reset
 *    draws a cliff that never happened.
 *  - **This deck.** Everything else on the card is deck-scoped; a player-wide
 *    line under a "Season 1–0" chip reads as this deck's history.
 *  - **This session first.** Falls back to the season when the session has
 *    nothing to draw, and reports which one it used so the label can say so.
 *
 * The stamp is taken when a match *starts*, so each point is "where I stood
 * sitting down to this game". The rank the just-finished match earned lands in
 * the log a beat later, and the tracker feeds it back as `LiveMatch.rankNow`
 * (see tracker.rs `refresh_ended_rank`) — that becomes the final "now" point,
 * so the line ends on the game you just played instead of the one before it.
 */
import type { TrackedMatch } from "../types/tracker";
import { isLadderEvent, parseRank } from "./ranks";
import { sessionWindow } from "./recapStats";
import { seasonKeyOf } from "./tracker";

/** Points on the post-match sparkline. */
export const RANK_PATH_MAX_POINTS = 12;

export type RankPathScope = "session" | "season";

export interface RankPathPoint {
  /** Match this sample was taken at the start of — absent on the "now" point. */
  matchId?: string;
  /** Monotonic rank score (see `parseRank`). */
  score: number;
  /** Result of the match this sample belongs to, for the dot colour. */
  result?: string;
  at: number;
  /** True for the live sample: where the just-played match left you. */
  isNow?: boolean;
}

export interface RankPath {
  points: RankPathPoint[];
  /** Window the points were drawn from — the label says which. */
  scope: RankPathScope;
  /** Whether the path ends on the live rank the last match earned. */
  endsNow: boolean;
}

export interface RankPathOptions {
  /** Keep only matches on this deck (omit for a player-wide path). */
  onDeck?: (m: TrackedMatch) => boolean;
  /**
   * Live rank from the ended frame (`LiveMatch.rankNow`) plus the match it
   * belongs to. Only closes the path when that match is the newest one in
   * scope — otherwise the move belongs to some other game.
   */
  liveRank?: string | null;
  liveMatchId?: string | null;
  maxPoints?: number;
  nowMs?: number;
}

/** Same ranked season? Prefers Arena's ordinal, falls back to the month. */
function sameSeason(a: TrackedMatch, b: TrackedMatch): boolean {
  if (a.seasonOrdinal != null && b.seasonOrdinal != null) {
    return a.seasonOrdinal === b.seasonOrdinal;
  }
  return seasonKeyOf(a.endedAt) === seasonKeyOf(b.endedAt);
}

/**
 * One sample per match, plus the live "now" sample when the newest match in
 * scope is the one that just ended and its rank has actually moved. That last
 * point is the whole payoff of the post-match card: 1 game + a rank change is
 * already a line worth drawing.
 */
function toPoints(
  matches: TrackedMatch[],
  maxPoints: number,
  liveScore: number | null,
  liveMatchId: string | null | undefined,
): RankPathPoint[] {
  if (!matches.length) return [];
  const points: RankPathPoint[] = matches.map((m) => ({
    matchId: m.matchId,
    score: parseRank(m.myRank)!.score,
    result: m.result,
    at: m.startedAt > 0 ? m.startedAt : m.endedAt,
  }));
  const newest = matches[matches.length - 1];
  if (
    liveScore != null &&
    liveMatchId &&
    newest.matchId === liveMatchId &&
    liveScore !== points[points.length - 1].score
  ) {
    points.push({
      score: liveScore,
      result: newest.result,
      at: newest.endedAt,
      isNow: true,
    });
  }
  return points.slice(-maxPoints);
}

export function buildRankPath(
  matches: TrackedMatch[],
  opts: RankPathOptions = {},
): RankPath | null {
  const maxPoints = Math.max(2, opts.maxPoints ?? RANK_PATH_MAX_POINTS);
  const candidates = matches
    .filter(
      (m) =>
        isLadderEvent(m.eventId) &&
        parseRank(m.myRank) != null &&
        (!opts.onDeck || opts.onDeck(m)),
    )
    .sort((a, b) => a.endedAt - b.endedAt);
  if (!candidates.length) return null;

  const newest = candidates[candidates.length - 1];
  const season = candidates.filter((m) => sameSeason(m, newest));

  // Session window comes from the *whole* history so it lines up with the
  // Session chip next to it — a deck-scoped window would start later.
  const { fromMs } = sessionWindow(matches, opts.nowMs ?? Date.now());
  const session = season.filter((m) => m.endedAt >= fromMs);

  const liveScore = parseRank(opts.liveRank)?.score ?? null;
  for (const [scope, window] of [
    ["session", session],
    ["season", season],
  ] as const) {
    const points = toPoints(window, maxPoints, liveScore, opts.liveMatchId);
    if (points.length >= 2) {
      return { points, scope, endsNow: !!points[points.length - 1].isNow };
    }
  }
  return null;
}
