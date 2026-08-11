/**
 * Opt-in deck sync — Phase 2 slice 7. Design: `docs/BACKEND-PHASE-2.md` §2.
 *
 * The app has no hand-authored deck library: "your decks" are the lists Arena
 * registered at the start of each match, carried on `TrackedMatch` as
 * `deckHash` + `deckMain`/`deckSide`. So a deck row is assembled by collapsing
 * match history by hash — same 75 cards, one row, newest name wins.
 *
 * That history is re-derived from Arena's own logs on every launch, which is
 * exactly why this is worth backing up: the logs rotate. Once they do, a list
 * whose matches predate the surviving log is gone locally and there is no way
 * to get it back from Arena.
 *
 * Like matches, the payload is an **explicit allowlist**, never a serialised
 * `TrackedMatch`, and a test pins the exact key set. Nothing about an opponent
 * appears here — a decklist is the user's own.
 */

import type { TrackedMatch } from "../../types/tracker";
import type { Deck, FormatId } from "../../types/meta";
import { myArchetypeName } from "./matchSync";

/** Rows accepted by `public.decks`. */
export interface DeckRow {
  user_id: string;
  deck_hash: string;
  name: string;
  format: "standard" | "pioneer";
  main: number[];
  side: number[];
  played_at: string;
}

/** A list restored from the cloud, keyed for local lookup by `deckHash`. */
export interface CloudDeck {
  deckHash: string;
  name: string;
  format: string;
  main: number[];
  side: number[];
  playedAt: number | null;
  /** Shown on the owner's public profile page. Off unless they said so. */
  isPublic: boolean;
}

function isSyncableFormat(id: FormatId | string | null | undefined): id is
  | "standard"
  | "pioneer" {
  const f = String(id ?? "").toLowerCase();
  return f === "standard" || f === "pioneer";
}

/**
 * Collapse match history into one row per distinct list.
 *
 * Only game-1 registrations carry a list, so matches without `deckMain` are
 * skipped rather than uploaded as an empty deck — a row claiming a 0-card list
 * would be worse than no row. The freshest match wins the name, because a
 * renamed deck should sync under the name the user currently sees.
 */
export function collectDeckRows(
  userId: string,
  matches: readonly TrackedMatch[],
  ctx: {
    formatFor: (m: TrackedMatch) => FormatId | string | null;
    decks?: readonly Deck[];
  },
): DeckRow[] {
  const byHash = new Map<string, { row: DeckRow; at: number }>();
  for (const m of matches) {
    const hash = m.deckHash?.trim();
    if (!hash) continue;
    if (!m.deckMain?.length) continue;
    const format = ctx.formatFor(m);
    if (!isSyncableFormat(format)) continue;

    const name = myArchetypeName(m, ctx.decks) ?? m.deckName?.trim() ?? "";
    if (!name) continue;

    const at = m.endedAt ?? 0;
    const prev = byHash.get(hash);
    if (prev && prev.at >= at) continue;
    byHash.set(hash, {
      at,
      row: {
        user_id: userId,
        deck_hash: hash,
        name,
        format,
        main: [...m.deckMain],
        side: [...(m.deckSide ?? [])],
        played_at: new Date(at).toISOString(),
      },
    });
  }
  return [...byHash.values()]
    .sort((a, b) => b.at - a.at)
    .map((v) => v.row);
}

/**
 * Fingerprint of what a run would upload, so an unchanged library costs one
 * cheap comparison instead of a network round trip. Deck rows have no natural
 * high-water mark the way matches do (a list can be *renamed* without any new
 * match), so this covers the fields that actually change.
 */
export function deckSyncFingerprint(rows: readonly DeckRow[]): string {
  return rows
    .map((r) => `${r.deck_hash}:${r.name}:${r.format}:${r.main.length}:${r.side.length}`)
    .sort()
    .join("|");
}

/** Parse a `public.decks` row into the local shape, dropping anything malformed. */
export function toCloudDeck(row: unknown): CloudDeck | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const deckHash = typeof r.deck_hash === "string" ? r.deck_hash : null;
  if (!deckHash) return null;
  const nums = (v: unknown): number[] =>
    Array.isArray(v) ? v.filter((n): n is number => Number.isFinite(n)) : [];
  const main = nums(r.main);
  if (!main.length) return null;
  const playedAt = typeof r.played_at === "string" ? Date.parse(r.played_at) : NaN;
  return {
    deckHash,
    name: typeof r.name === "string" ? r.name : "",
    format: typeof r.format === "string" ? r.format : "",
    main,
    side: nums(r.side),
    playedAt: Number.isFinite(playedAt) ? playedAt : null,
    // Absent or malformed reads as private. Publishing is a decision the user
    // makes; it is never something a parsing default should do for them.
    isPublic: r.is_public === true,
  };
}

/** Cloud lists indexed by `deckHash`, for filling gaps in local history. */
export function indexByHash(decks: readonly CloudDeck[]): Map<string, CloudDeck> {
  const out = new Map<string, CloudDeck>();
  for (const d of decks) out.set(d.deckHash, d);
  return out;
}
