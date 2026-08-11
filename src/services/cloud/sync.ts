/**
 * Upload/read orchestration for the cloud opt-in.
 *
 * Everything here is a no-op unless the user is signed in **and** has turned
 * `cloud_enabled` on. Signing in alone never starts an upload — that is a
 * separate, explicit choice (`docs/BACKEND-PHASE-2.md` §0).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Deck, FormatId, MetaBundle } from "../../types/meta";
import type { TrackedMatch } from "../../types/tracker";
import { getSupabase, getCurrentUser } from "./auth";
import { buildSharedMatch, chunk, clientHash, myArchetypeName } from "./matchSync";
import type { RollupRow } from "./crowdMeta";
import { cloudConfigured } from "./config";

const UPLOADED_KEY = "bbi.cloud.uploadedThrough";

/** Highest `endedAt` already uploaded, so a session only sends the new tail. */
function uploadedThrough(): number {
  try {
    return Number(localStorage.getItem(UPLOADED_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function setUploadedThrough(ms: number) {
  try {
    localStorage.setItem(UPLOADED_KEY, String(ms));
  } catch {
    /* best effort */
  }
}

/** Clear the watermark — used when opting out, so opting back in re-syncs. */
export function resetUploadWatermark() {
  try {
    localStorage.removeItem(UPLOADED_KEY);
  } catch {
    /* ignore */
  }
}

export async function isCloudEnabled(): Promise<boolean> {
  if (!cloudConfigured()) return false;
  const user = await getCurrentUser();
  if (!user) return false;
  try {
    const supabase = await getSupabase();
    const { data } = await supabase
      .from("profiles")
      .select("cloud_enabled")
      .eq("id", user.id)
      .maybeSingle();
    return Boolean(data?.cloud_enabled);
  } catch {
    return false;
  }
}

export async function setCloudEnabled(on: boolean): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Sign in first.");
  const supabase = await getSupabase();
  const { error } = await supabase
    .from("profiles")
    .update({ cloud_enabled: on })
    .eq("id", user.id);
  if (error) throw error;
  if (!on) {
    // Opting out deletes what was shared. "Stop sending" is not the same as
    // "take it back", and the toggle promises the latter.
    await supabase.from("shared_matches").delete().eq("user_id", user.id);
    resetUploadWatermark();
  }
}

/** Resolve a match's format from the meta bundle, falling back to its queue. */
function formatFor(match: TrackedMatch, meta: MetaBundle | null): FormatId | null {
  const id = String(match.eventId ?? "").toLowerCase();
  if (id.includes("pioneer") || id.includes("explorer")) return "pioneer" as FormatId;
  if (id.includes("standard") || id.includes("ladder")) return "standard" as FormatId;
  return (meta?.formats?.[0]?.id as FormatId) ?? null;
}

export interface UploadOutcome {
  attempted: number;
  uploaded: number;
  skipped: number;
}

/** Matches processed per run — see the backlog note in `uploadNewMatches`. */
export const MAX_PER_RUN = 200;

/** Guards against a launch upload and a match-end upload overlapping. */
let inFlight = false;

/**
 * Send matches newer than the watermark. Idempotent server-side (unique on
 * `user_id, client_hash`), so a duplicate run costs nothing and a failure can
 * simply be retried next launch.
 */
export async function uploadNewMatches(args: {
  matches: readonly TrackedMatch[];
  meta: MetaBundle | null;
  decks?: readonly Deck[];
  oppArchetypeFor?: (m: TrackedMatch) => { name: string | null; confidence: number | null };
}): Promise<UploadOutcome> {
  const empty = { attempted: 0, uploaded: 0, skipped: 0 };
  // A launch sync and a match-end sync can fire close together; running both
  // would double the inference work and race on the watermark.
  if (inFlight) return empty;
  if (!(await isCloudEnabled())) return empty;
  const user = await getCurrentUser();
  if (!user) return empty;
  inFlight = true;
  try {
    return await runUpload(user.id, args);
  } finally {
    inFlight = false;
  }
}

async function runUpload(
  userId: string,
  args: {
    matches: readonly TrackedMatch[];
    meta: MetaBundle | null;
    decks?: readonly Deck[];
    oppArchetypeFor?: (m: TrackedMatch) => { name: string | null; confidence: number | null };
  },
): Promise<UploadOutcome> {
  const empty = { attempted: 0, uploaded: 0, skipped: 0 };
  const user = { id: userId };

  const since = uploadedThrough();
  // Oldest first, so the high-water mark advances monotonically and a capped
  // run resumes exactly where it stopped.
  const pending = args.matches
    .filter((m) => m.endedAt > since)
    .sort((a, b) => a.endedAt - b.endedAt);
  if (!pending.length) return empty;

  // First run after opting in has the entire history to send, and each match
  // costs an archetype inference. Cap the batch so a long-time user's backlog
  // drains over a few launches instead of stalling one.
  const fresh = pending.slice(0, MAX_PER_RUN);

  const rows = [];
  for (const m of fresh) {
    const opp = args.oppArchetypeFor?.(m) ?? { name: null, confidence: null };
    const row = buildSharedMatch(
      user.id,
      m,
      {
        formatId: formatFor(m, args.meta),
        myArchetypeName: myArchetypeName(m, args.decks),
        oppArchetypeName: opp.name,
        oppConfidence: opp.confidence,
      },
      await clientHash(user.id, m.matchId),
    );
    if (row) rows.push(row);
  }

  if (!rows.length) {
    // Nothing uploadable, but they were still considered — advance the mark so
    // unusable matches are not re-examined every launch.
    setUploadedThrough(Math.max(since, ...fresh.map((m) => m.endedAt)));
    return { attempted: fresh.length, uploaded: 0, skipped: fresh.length };
  }

  const supabase: SupabaseClient = await getSupabase();
  let uploaded = 0;
  let highest = since;

  for (const part of chunk(rows)) {
    const { error } = await supabase
      .from("shared_matches")
      .upsert(part, { onConflict: "user_id,client_hash", ignoreDuplicates: true });
    if (error) break; // stop at the first failure; the watermark holds
    uploaded += part.length;
    for (const r of part) highest = Math.max(highest, Date.parse(r.ended_at));
  }

  if (uploaded > 0) setUploadedThrough(highest);
  return { attempted: fresh.length, uploaded, skipped: fresh.length - uploaded };
}

// ---------------------------------------------------------------------------
// Public profile (slice 4)
// ---------------------------------------------------------------------------

/** Same shape the server enforces, so bad input fails before a round trip. */
const HANDLE_RE = /^[a-z0-9][a-z0-9_-]{1,22}[a-z0-9]$/;

export const RESERVED_HANDLES = new Set([
  "admin", "root", "api", "www", "app", "support", "help", "about", "settings",
  "login", "signin", "signup", "account", "filthynetdeck", "fnd", "official",
  "staff", "mod", "moderator", "system", "null", "undefined", "u",
]);

/** null when fine, otherwise a message to show the user. */
export function handleProblem(raw: string): string | null {
  const h = raw.trim().toLowerCase();
  if (!h) return "Pick a name for your profile link.";
  if (h.length < 3) return "Too short — 3 characters minimum.";
  if (h.length > 24) return "Too long — 24 characters maximum.";
  if (!HANDLE_RE.test(h)) {
    return "Use letters, numbers, hyphens or underscores, starting and ending with a letter or number.";
  }
  if (RESERVED_HANDLES.has(h)) return "That name is reserved. Try another.";
  return null;
}

export interface ProfileSettings {
  handle: string | null;
  profilePublic: boolean;
}

export async function fetchProfileSettings(): Promise<ProfileSettings | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  try {
    const supabase = await getSupabase();
    const { data } = await supabase
      .from("profiles")
      .select("handle, profile_public")
      .eq("id", user.id)
      .maybeSingle();
    return {
      handle: (data?.handle as string | null) ?? null,
      profilePublic: Boolean(data?.profile_public),
    };
  } catch {
    return null;
  }
}

/**
 * Claim a handle. Goes through the `claim_handle` function rather than a direct
 * update so a collision comes back as something the UI can say out loud instead
 * of a raw 23505, and so a user can only ever set their own.
 */
export async function claimHandle(raw: string): Promise<string> {
  const problem = handleProblem(raw);
  if (problem) throw new Error(problem);
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc("claim_handle", {
    new_handle: raw.trim().toLowerCase(),
  });
  if (error) {
    throw new Error(
      /unique|taken|duplicate/i.test(error.message)
        ? "That name is already taken."
        : error.message,
    );
  }
  return String(data ?? raw.trim().toLowerCase());
}

export async function setProfilePublic(on: boolean): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Sign in first.");
  const supabase = await getSupabase();
  const { error } = await supabase
    .from("profiles")
    .update({ profile_public: on })
    .eq("id", user.id);
  if (error) throw error;
}

/**
 * Community matchup rows for a format. Reads the rollup only — raw matches are
 * never queried, so egress stays flat as uploads grow.
 */
export async function fetchRollup(
  format: "standard" | "pioneer",
  bestOf: 1 | 3,
): Promise<RollupRow[]> {
  if (!cloudConfigured()) return [];
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("matchup_rollup")
      .select(
        "format,best_of,a_archetype,b_archetype,games,a_wins,a_on_play_games,a_on_play_wins,contributors",
      )
      .eq("format", format)
      .eq("best_of", bestOf);
    if (error || !data) return [];
    return data as RollupRow[];
  } catch {
    return [];
  }
}
