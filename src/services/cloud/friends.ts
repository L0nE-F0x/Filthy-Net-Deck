/**
 * Phase 5 — light social. Friend codes and the stat line you compare.
 *
 * A friend code is deliberately not a handle: a handle is a public identity
 * with a page at `/u/<handle>`, a friend code is a private token you hand to
 * someone you know and can roll if you post it somewhere you regret. Handing
 * it over IS the consent — there is no request/accept dance, which is what
 * keeps this "light".
 *
 * There is no chat and nothing here carries free text between users: a
 * friendship is two ids and a timestamp (`PLATFORM-STRATEGY.md` §1.5).
 */

import { getSupabase, getCurrentUser } from "./auth";
import { cloudConfigured } from "./config";

/** One row of the comparison table. */
export interface FriendLine {
  userId: string;
  /** What to call them: their chosen display name, else handle, else "Player". */
  name: string;
  handle: string | null;
  isMe: boolean;
  matches: number;
  wins: number;
  losses: number;
  /** Freshest rank they have shared, e.g. "Diamond 2". Null when unknown. */
  bestRank: string | null;
  lastMatch: number | null;
}

/** Codes are read aloud and typed by hand; accept any casing and spacing. */
export function normalizeFriendCode(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 8);
}

/**
 * The alphabet excludes I, L, O, 0 and 1 on purpose — those are the characters
 * people mistype when copying a code out of a Discord message.
 */
export function looksLikeFriendCode(raw: string): boolean {
  // Must match `generate_friend_code`'s alphabet exactly (I, L, O, 0, 1 are
  // absent). If this were looser, a mistyped code would reach the server and
  // come back as "no one is using that code" — blaming the sender for a typo.
  return /^[A-HJKMNP-Z2-9]{8}$/.test(normalizeFriendCode(raw));
}

/** Your code, minting one on first use. `regenerate` rolls it. */
export async function myFriendCode(regenerate = false): Promise<string | null> {
  if (!cloudConfigured()) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc("my_friend_code", { regenerate });
  if (error) throw error;
  return typeof data === "string" ? data : null;
}

export async function addFriendByCode(code: string): Promise<void> {
  const clean = normalizeFriendCode(code);
  if (!looksLikeFriendCode(clean)) {
    throw new Error("That doesn't look like a friend code — 8 letters and numbers.");
  }
  const supabase = await getSupabase();
  const { error } = await supabase.rpc("add_friend_by_code", { code: clean });
  if (error) {
    // Postgres codes, mapped to something worth reading.
    if (/no such code|no_data_found/i.test(error.message)) {
      throw new Error("No one is using that code.");
    }
    if (/your own code/i.test(error.message)) {
      throw new Error("That's your own code.");
    }
    throw error;
  }
}

export async function removeFriend(userId: string): Promise<boolean> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc("remove_friend", { friend: userId });
  if (error) throw error;
  return data === true;
}

interface RawLine {
  user_id: string;
  display_name: string | null;
  handle: string | null;
  is_me: boolean;
  matches: number | string;
  wins: number | string;
  losses: number | string;
  best_rank: string | null;
  last_match: string | null;
}

/**
 * You and your friends, one line each. `season` narrows to a single Arena
 * ranked season for the seasonal race; omit it for all time.
 *
 * A friend with sharing switched off comes back with zeroes rather than being
 * dropped — "they haven't shared anything" is a truer answer than pretending
 * they are not on your list.
 */
export async function friendLines(season?: number | null): Promise<FriendLine[]> {
  if (!cloudConfigured()) return [];
  const user = await getCurrentUser();
  if (!user) return [];
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase.rpc("friend_lines", {
      season: season ?? null,
    });
    if (error || !Array.isArray(data)) return [];
    return (data as RawLine[]).map((r) => {
      const at = r.last_match ? Date.parse(r.last_match) : NaN;
      return {
        userId: r.user_id,
        name: r.display_name?.trim() || r.handle || "Player",
        handle: r.handle,
        isMe: Boolean(r.is_me),
        matches: Number(r.matches) || 0,
        wins: Number(r.wins) || 0,
        losses: Number(r.losses) || 0,
        bestRank: r.best_rank,
        lastMatch: Number.isFinite(at) ? at : null,
      } satisfies FriendLine;
    });
  } catch {
    return [];
  }
}

/** Decided-games winrate, or null when nobody has finished a game yet. */
export function winrateOf(line: FriendLine): number | null {
  const decided = line.wins + line.losses;
  return decided ? line.wins / decided : null;
}

/**
 * Leaderboard order: most wins first, then winrate, then fewest losses.
 *
 * Wins lead rather than winrate because this is a *race* — someone 40–20 is
 * ahead of someone 2–0, and sorting by rate would put the 2–0 on top of the
 * table every season. Ties fall through to rate so a better record wins at
 * equal volume.
 */
export function rankFriends(lines: FriendLine[]): FriendLine[] {
  return [...lines].sort(
    (x, y) =>
      y.wins - x.wins ||
      (winrateOf(y) ?? 0) - (winrateOf(x) ?? 0) ||
      x.losses - y.losses ||
      x.name.localeCompare(y.name),
  );
}
