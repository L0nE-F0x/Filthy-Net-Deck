/**
 * Personal history backup — the download half of cross-device sync.
 *
 * The gap this closes: until now `shared_matches` was written and never read.
 * Match history was re-derived from the Arena logs of whichever machine you
 * were sitting at, so signing in on a second machine showed an empty Stats
 * page even though the account had months of data behind it. Uploading was
 * built; restoring was not.
 *
 * This is deliberately NOT `shared_matches`. That table is the user's
 * contribution to the crowd rollup — Standard and Pioneer only, no queue, no
 * deck name, no per-game detail, and an irreversible hash where the match id
 * should be. Restoring from it would drop every Brawl and Limited game and
 * mislabel the rest. See the migration header for why widening it was the
 * wrong move.
 *
 * Like every other upload here the payload is an **explicit allowlist**, never
 * a serialised `TrackedMatch`, and a test pins the exact key set. The three
 * opponent fields are absent by the same rule that governs `matchSync`: an
 * Arena handle and the cards someone revealed belong to a player who consented
 * to nothing, and a private table does not change that. Own-rows-only RLS is
 * an access-control claim; consent is a different question.
 */

import type { TrackedGame, TrackedMatch, MatchResult } from "../../types/tracker";
import { clientHash } from "./matchSync";

/**
 * The row key: `sha256(userId + ":" + arenaMatchId)`, the same digest
 * `shared_matches` uses.
 *
 * Arena's raw match id is **not** stored, here or anywhere. `privacy.html` §3
 * lists it under "never uploaded, under any setting — hashed before it is
 * used", and that claim is unconditional, so a private table does not get an
 * exemption from it. Nothing needs the id to be Arena's actual one: the row
 * only needs a key that is stable for this user and unique per match, and a
 * salted digest is both.
 *
 * The cost is that a restored match carries the digest as its `matchId`. That
 * is fine everywhere it lands — a React key, a delete target, a dedupe key —
 * and the machine that actually played the match still has the real id in its
 * own logs.
 */
export async function backupId(userId: string, matchId: string): Promise<string> {
  return clientHash(userId, matchId);
}

/**
 * Digests for a batch, keyed by the raw id they came from.
 *
 * Hashing is async, and the merge runs on a 12s poll, so it happens exactly
 * once per sync or restore rather than per comparison.
 */
export async function backupIdsFor(
  userId: string,
  // Not `TrackedMatch[]`: callers also hash bare tombstone ids, and widening
  // the parameter is better than casting a string list into a match shape.
  matches: readonly { matchId: string }[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.all(
    matches.map(async (m) => {
      if (m.matchId) out.set(m.matchId, await backupId(userId, m.matchId));
    }),
  );
  return out;
}

/** Rows accepted by `public.match_backup`. */
export interface BackupRow {
  user_id: string;
  /** Salted digest, never Arena's own id. See `backupId`. */
  match_id: string;
  started_at: string;
  ended_at: string;
  event_id: string;
  best_of: number;
  my_team_id: number;
  games: TrackedGame[];
  result: MatchResult;
  result_reason: string | null;
  deck_name: string | null;
  deck_id: string | null;
  deck_hash: string | null;
  my_rank: string | null;
  season_ordinal: number | null;
  deck_main: number[] | null;
  deck_side: number[] | null;
}

/** A finite unix-ms timestamp, or null when the value cannot be trusted. */
function isoOrNull(ms: number | undefined): string | null {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return null;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Build the row, or null when the match cannot be stored faithfully.
 *
 * Only two rejections, and both are structural rather than editorial: a match
 * with no id has no identity to upsert on, and one with no usable timestamps
 * would sort into the wrong place on restore. Everything else goes up —
 * including `result: "unknown"`. A disconnect is part of the history, and
 * dropping it here would make the restored match count disagree with the
 * machine it came from, which reads as data loss rather than as tidying.
 */
export function toBackupRow(
  userId: string,
  m: TrackedMatch,
  hashedId: string,
): BackupRow | null {
  if (!m.matchId?.trim() || !hashedId) return null;
  const started = isoOrNull(m.startedAt);
  const ended = isoOrNull(m.endedAt) ?? started;
  if (!started || !ended) return null;

  const result: MatchResult =
    m.result === "win" || m.result === "loss" || m.result === "draw" ? m.result : "unknown";

  return {
    user_id: userId,
    match_id: hashedId,
    started_at: started,
    ended_at: ended,
    // `event_id` is not null on the server. An unnamed queue is rare but real
    // (a log line Arena changed shape on), and losing the whole match over it
    // would be a poor trade — "" restores as an unknown queue, which every
    // format helper already handles.
    event_id: m.eventId ?? "",
    best_of: m.bestOf === 3 ? 3 : 1,
    my_team_id: typeof m.myTeamId === "number" ? m.myTeamId : 0,
    // Copied field-by-field rather than passed through: `games` is the one
    // place a future tracker field would otherwise ride along unnoticed.
    games: (m.games ?? []).map((g) => ({
      winningTeamId: g.winningTeamId,
      reason: g.reason,
      onPlay: g.onPlay,
      mulligans: g.mulligans,
      firstLandTurn: g.firstLandTurn,
    })),
    result,
    result_reason: m.resultReason ?? null,
    deck_name: m.deckName ?? null,
    deck_id: m.deckId ?? null,
    deck_hash: m.deckHash ?? null,
    my_rank: m.myRank ?? null,
    season_ordinal: m.seasonOrdinal ?? null,
    deck_main: m.deckMain ?? null,
    deck_side: m.deckSide ?? null,
  };
}

/** Shape as it comes back from PostgREST — every column nullable in practice. */
export interface BackupRowIn {
  match_id?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  event_id?: string | null;
  best_of?: number | null;
  my_team_id?: number | null;
  games?: unknown;
  result?: string | null;
  result_reason?: string | null;
  deck_name?: string | null;
  deck_id?: string | null;
  deck_hash?: string | null;
  my_rank?: string | null;
  season_ordinal?: number | null;
  deck_main?: unknown;
  deck_side?: unknown;
}

const msOrNull = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
};

/** `jsonb` comes back as `unknown`; keep only the numbers. */
function numbersOrUndefined(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  return out.length ? out : undefined;
}

function gamesFrom(value: unknown): TrackedGame[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw): TrackedGame => {
    const g = (raw ?? {}) as Record<string, unknown>;
    const num = (k: string) => (typeof g[k] === "number" ? (g[k] as number) : undefined);
    return {
      winningTeamId: num("winningTeamId"),
      reason: typeof g.reason === "string" ? g.reason : undefined,
      onPlay: typeof g.onPlay === "boolean" ? g.onPlay : undefined,
      mulligans: num("mulligans"),
      firstLandTurn: num("firstLandTurn"),
    };
  });
}

/**
 * Rebuild a `TrackedMatch` from a backup row, or null when the row is unusable.
 *
 * The three opponent fields are left `undefined` rather than filled with a
 * placeholder. Every surface that reads them already treats absence as the
 * normal case — matches recorded before those fields existed look the same —
 * so a restored match degrades along a path the UI has always handled, instead
 * of one it has never seen.
 */
export function fromBackupRow(row: BackupRowIn): TrackedMatch | null {
  const matchId = row.match_id?.trim();
  if (!matchId) return null;
  const startedAt = msOrNull(row.started_at);
  if (startedAt == null) return null;
  const endedAt = msOrNull(row.ended_at) ?? startedAt;

  const result = row.result;
  const out: TrackedMatch = {
    matchId,
    startedAt,
    endedAt,
    eventId: row.event_id ?? "",
    bestOf: row.best_of === 3 ? 3 : 1,
    myTeamId: typeof row.my_team_id === "number" ? row.my_team_id : 0,
    games: gamesFrom(row.games),
    result:
      result === "win" || result === "loss" || result === "draw" ? result : "unknown",
  };

  // Assigned conditionally so a restored match has the same key shape as a
  // locally parsed one. `exactOptionalPropertyTypes` aside, an explicit
  // `deckName: undefined` serialises into CSV exports as an empty column where
  // a local match omits it.
  if (row.result_reason) out.resultReason = row.result_reason;
  if (row.deck_name) out.deckName = row.deck_name;
  if (row.deck_id) out.deckId = row.deck_id;
  if (row.deck_hash) out.deckHash = row.deck_hash;
  if (row.my_rank) out.myRank = row.my_rank;
  if (typeof row.season_ordinal === "number") out.seasonOrdinal = row.season_ordinal;
  const main = numbersOrUndefined(row.deck_main);
  if (main) out.deckMain = main;
  const side = numbersOrUndefined(row.deck_side);
  if (side) out.deckSide = side;

  return out;
}

/**
 * Which of the user's matches still need uploading.
 *
 * There is no high-water mark here, unlike `shared_matches`. A match can be
 * edited after the fact — an opponent tag, a corrected result, a deck
 * reassignment — and "newer than X" would never re-send it. Instead the caller
 * passes the digests the cloud already holds, which one cheap `select` gets,
 * and this returns the difference.
 */
export function pendingBackup(
  matches: readonly TrackedMatch[],
  ids: ReadonlyMap<string, string>,
  known: ReadonlySet<string>,
): TrackedMatch[] {
  return matches.filter((m) => {
    const id = ids.get(m.matchId);
    return Boolean(id) && !known.has(id!);
  });
}

/**
 * Restored rows this machine should actually show.
 *
 * Two exclusions, and they need the digest rather than the raw id because a
 * restored match carries the digest as its `matchId` while a local one carries
 * Arena's:
 *
 *  - **Already here.** Every machine restores its own backup on the next
 *    launch, so without this the common case would be a library that doubles
 *    itself.
 *  - **Deleted here.** A tombstone is a decision; a cloud copy riding back in
 *    would undo it silently. Local tombstones hold raw ids for matches parsed
 *    here and digests for ones that arrived restored, so the caller passes both
 *    forms and this checks against the set as given.
 */
export function filterRestored(
  restored: readonly TrackedMatch[],
  localIds: ReadonlySet<string>,
  tombstones: ReadonlySet<string> = new Set(),
): TrackedMatch[] {
  return restored.filter(
    (m) => !localIds.has(m.matchId) && !tombstones.has(m.matchId),
  );
}

/**
 * Local history plus whatever the cloud could add, newest first.
 *
 * Deliberately **synchronous and cheap**: it runs on the 12s tracker poll and
 * on every recorded match, so the expensive part — working out which restored
 * rows belong here at all — is done once by `filterRestored` and this just
 * concatenates the result.
 *
 * Sorted by `startedAt` descending to match what `tracker_matches` returns, so
 * a merged list is indistinguishable from a local one to every consumer
 * downstream. The id dedupe is defensive: `filterRestored` has already removed
 * anything this machine holds, and a locally parsed match wins if one ever
 * slipped through, because it carries the opponent fields the backup drops.
 */
export function mergeRestored(
  local: readonly TrackedMatch[],
  restored: readonly TrackedMatch[],
): TrackedMatch[] {
  if (!restored.length) return local.slice();
  const have = new Set(local.map((m) => m.matchId));
  const extra = restored.filter((m) => !have.has(m.matchId));
  if (!extra.length) return local.slice();
  return [...local, ...extra].sort((a, b) => b.startedAt - a.startedAt);
}

/** Ids present in the cloud but not on this machine — what a restore added. */
export function restoredCount(
  local: readonly TrackedMatch[],
  merged: readonly TrackedMatch[],
): number {
  return Math.max(0, merged.length - local.length);
}
