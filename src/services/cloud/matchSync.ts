/**
 * Opt-in match upload — Phase 2 slice 5. Design: `docs/BACKEND-PHASE-2.md` §1.
 *
 * The payload is built from an **explicit allowlist**, never by serialising a
 * `TrackedMatch`. That is the mechanism that stops a field added to the tracker
 * later from silently starting to upload — and it is enforced by a test that
 * asserts the exact key set.
 *
 * Two fields are deliberately never sent, and neither is a marketing position:
 * `opponentName` and `opponentSeen` describe another player who consented to
 * nothing. The archetype is inferred locally and only the *label* leaves.
 */

import type { TrackedMatch } from "../../types/tracker";
import type { Deck, FormatId } from "../../types/meta";
import { isLadderEvent } from "../ranks";
import { archetypeSlug } from "./archetypeSlug";

/** Rows accepted by `public.shared_matches`. */
export interface SharedMatchRow {
  user_id: string;
  client_hash: string;
  started_at: string;
  ended_at: string;
  format: "standard" | "pioneer";
  best_of: 1 | 3;
  ranked: boolean;
  rank: string | null;
  season_ordinal: number | null;
  my_deck_hash: string | null;
  my_archetype: string;
  opp_archetype: string | null;
  opp_confidence: number | null;
  result: "win" | "loss" | "draw";
  games: { onPlay: boolean | null; won: boolean }[];
}

/**
 * Stable per-user dedupe key. Salted with the user id so the same Arena match
 * id from two different accounts does not collide, and hashed so Arena's own
 * identifier never leaves the machine.
 */
export async function clientHash(userId: string, matchId: string): Promise<string> {
  const data = new TextEncoder().encode(`${userId}:${matchId}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Which of the two seats won a given game, from the local player's team id. */
function gameWon(m: TrackedMatch, winningTeamId: number | undefined): boolean {
  return winningTeamId != null && winningTeamId === m.myTeamId;
}

/**
 * Build the row, or null when the match should not be uploaded at all.
 *
 * Rejected on purpose:
 * - unfinished / unknown results — nothing to aggregate
 * - non-constructed or unknown formats
 * - matches with no confident opponent archetype **and** no own archetype
 */
export function buildSharedMatch(
  userId: string,
  match: TrackedMatch,
  ctx: {
    formatId: FormatId | null;
    myArchetypeName: string | null;
    oppArchetypeName: string | null;
    oppConfidence: number | null;
  },
  hash: string,
): SharedMatchRow | null {
  if (match.result !== "win" && match.result !== "loss" && match.result !== "draw") {
    return null;
  }
  const my = archetypeSlug(ctx.formatId, ctx.myArchetypeName);
  if (!my) return null;

  const fmt = String(ctx.formatId ?? "").toLowerCase();
  if (fmt !== "standard" && fmt !== "pioneer") return null;

  const bestOf = match.bestOf === 3 ? 3 : 1;

  return {
    user_id: userId,
    client_hash: hash,
    started_at: new Date(match.startedAt).toISOString(),
    ended_at: new Date(match.endedAt).toISOString(),
    format: fmt,
    best_of: bestOf,
    ranked: isLadderEvent(match.eventId),
    rank: match.myRank ?? null,
    season_ordinal: match.seasonOrdinal ?? null,
    my_deck_hash: match.deckHash ?? null,
    my_archetype: my,
    opp_archetype: archetypeSlug(ctx.formatId, ctx.oppArchetypeName),
    opp_confidence: ctx.oppConfidence,
    result: match.result,
    games: (match.games ?? []).map((g) => ({
      onPlay: g.onPlay ?? null,
      won: gameWon(match, g.winningTeamId),
    })),
  };
}

/** Uploads are chunked so one bad row cannot fail an entire backlog. */
export const UPLOAD_CHUNK = 50;

export function chunk<T>(items: readonly T[], size = UPLOAD_CHUNK): T[][] {
  if (size <= 0) return [items.slice()];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Deck name for a tracked match, preferring a recognised meta archetype. */
export function myArchetypeName(
  match: TrackedMatch,
  decks: readonly Deck[] | undefined,
): string | null {
  const byHash = decks?.find((d) => d.id && match.deckHash && d.id === match.deckHash);
  if (byHash) return byHash.archetype || byHash.name;
  // Fall back to the user's own deck name. It is their label for their own
  // deck, so it is honest — it just may not join with anyone else's slug.
  return match.deckName?.trim() || null;
}
