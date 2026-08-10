/**
 * Your record per archetype — the personal half of the Matchups page.
 *
 * Replaces the old Matchup Lab model, which keyed records on a **manual tag
 * attached to an opponent's name**. Two problems with that: on ladder you
 * almost never meet the same player twice, so per-opponent records never
 * accumulate; and the archetype records that *were* useful demanded tagging
 * for something the app can already work out. `inferOpponentArchetype` has
 * existed for a while and this page never called it.
 *
 * Now: infer automatically, and let an existing manual tag win where the user
 * bothered to set one — their explicit label beats a guess, and nobody's
 * tagging work is thrown away.
 */

import type { Deck, FormatId } from "../../types/meta";
import type { TrackedMatch } from "../../types/tracker";
import {
  inferOpponentArchetype,
  type NameResolver,
} from "../opponentArchetype";
import { archetypeSlug, labelFromSlug } from "./archetypeSlug";
import { wilson, type Matchup } from "./crowdMeta";

export interface PersonalRecord {
  slug: string;
  label: string;
  wins: number;
  losses: number;
  games: number;
  /** null until at least one decided game. */
  winrate: number | null;
}

/** Confidence floor for counting an inferred archetype. Above the suggestion
 *  threshold: a wrong row here silently poisons a record the user will act on. */
export const MIN_INFER_CONFIDENCE = 0.5;

export interface ResolveOpts {
  resolveName: NameResolver;
  candidates: Deck[];
  /** Existing manual tags, keyed by opponent name — an override, not a requirement. */
  tagFor?: (m: TrackedMatch) => string | null;
  formatFor: (m: TrackedMatch) => FormatId | null;
}

/** The archetype a match should count toward, or null when unknowable. */
export function archetypeForMatch(m: TrackedMatch, o: ResolveOpts): string | null {
  const fmt = o.formatFor(m);
  if (!fmt) return null;

  const manual = o.tagFor?.(m)?.trim();
  if (manual) return archetypeSlug(fmt, manual);

  if (!m.opponentSeen?.length || !o.candidates.length) return null;
  const guess = inferOpponentArchetype(m.opponentSeen, o.resolveName, o.candidates, {
    minConfidence: MIN_INFER_CONFIDENCE,
  });
  if (!guess) return null;
  return archetypeSlug(fmt, guess.archetype);
}

/** Your win/loss per archetype, most-played first. Draws are excluded from the
 *  rate but still counted as games played, matching the rest of the app. */
export function personalRecords(
  matches: readonly TrackedMatch[],
  o: ResolveOpts,
): PersonalRecord[] {
  const by = new Map<string, { wins: number; losses: number; games: number }>();
  for (const m of matches) {
    const slug = archetypeForMatch(m, o);
    if (!slug) continue;
    let r = by.get(slug);
    if (!r) {
      r = { wins: 0, losses: 0, games: 0 };
      by.set(slug, r);
    }
    r.games++;
    if (m.result === "win") r.wins++;
    else if (m.result === "loss") r.losses++;
  }
  return [...by.entries()]
    .map(([slug, r]) => ({
      slug,
      label: labelFromSlug(slug),
      ...r,
      winrate: r.wins + r.losses > 0 ? (r.wins / (r.wins + r.losses)) * 100 : null,
    }))
    .sort((a, b) => b.games - a.games || a.label.localeCompare(b.label));
}

export interface MergedMatchup {
  slug: string;
  label: string;
  you: PersonalRecord | null;
  community: Matchup | null;
  /**
   * Percentage points your rate sits above/below the community's, or null when
   * either side is too thin to compare. This is the number the page exists for.
   */
  delta: number | null;
  /** True when your own sample is too small for the delta to mean anything. */
  yourSampleThin: boolean;
}

/** Below this, your own rate is noise and no delta is offered. */
export const MIN_PERSONAL_GAMES = 10;

/**
 * Join your record to the community's.
 *
 * Kept as an outer join on purpose: an archetype you have played but that the
 * community has no data for is still worth showing, and vice versa — the page
 * should never silently drop a matchup just because one side is missing.
 */
export function mergeMatchups(
  personal: readonly PersonalRecord[],
  community: readonly Matchup[],
): MergedMatchup[] {
  const byCommunity = new Map(community.map((c) => [c.opponent, c]));
  const seen = new Set<string>();
  const out: MergedMatchup[] = [];

  for (const p of personal) {
    seen.add(p.slug);
    const c = byCommunity.get(p.slug) ?? null;
    const decided = p.wins + p.losses;
    const thin = decided < MIN_PERSONAL_GAMES;
    out.push({
      slug: p.slug,
      label: p.label,
      you: p,
      community: c,
      delta: !thin && c && p.winrate != null ? p.winrate - c.winrate : null,
      yourSampleThin: thin,
    });
  }

  for (const c of community) {
    if (seen.has(c.opponent)) continue;
    out.push({
      slug: c.opponent,
      label: c.opponentLabel,
      you: null,
      community: c,
      delta: null,
      yourSampleThin: true,
    });
  }

  // Biggest gap first — that is the actionable end of the list. Matchups with
  // no comparison sort after, by how much you have played them.
  return out.sort((a, b) => {
    const da = a.delta == null ? null : Math.abs(a.delta);
    const db = b.delta == null ? null : Math.abs(b.delta);
    if (da != null && db != null) return db - da;
    if (da != null) return -1;
    if (db != null) return 1;
    return (b.you?.games ?? 0) - (a.you?.games ?? 0);
  });
}

/** Plain-language read of a delta — the page's whole point in one line. */
export function readDelta(m: MergedMatchup): string | null {
  if (m.delta == null || !m.you || !m.community) return null;
  const gap = Math.round(Math.abs(m.delta));
  if (gap < 5) return "You're in line with the field here.";
  const { low, high } = wilson(m.you.wins, m.you.wins + m.you.losses);
  const overlaps = low <= m.community.high && high >= m.community.low;
  if (overlaps) {
    return m.delta > 0
      ? `You're ahead of the field, but not by more than the samples explain.`
      : `You're behind the field, though the samples still overlap.`;
  }
  return m.delta > 0
    ? `You beat this matchup ${gap} points harder than the field does.`
    : `You lose this ${gap} points more than the field does — worth practising.`;
}


/**
 * Which archetype *you* were playing — the subject the community rate must be
 * for, if the comparison is to mean anything.
 *
 * This is the load-bearing decision on the Matchups page. Community rows are
 * "archetype A vs archetype B", so putting your record next to a community
 * number only makes sense when both describe the same deck facing the same
 * opponent. Comparing your Jank Brew's record against Mono-Red to *Azorius
 * Control's* record against Mono-Red is apples to oranges, and dressing it up
 * as a delta would be exactly the fabrication this product refuses elsewhere.
 *
 * So: resolve your deck to a recognised meta archetype, require a clear
 * majority, and return null otherwise. Callers show the personal side alone and
 * say why rather than inventing a comparison.
 */
export function subjectArchetype(
  matches: readonly TrackedMatch[],
  o: {
    formatFor: (m: TrackedMatch) => FormatId | null;
    /** Recognised archetype for the user's own deck, or null when unknown. */
    myArchetypeFor: (m: TrackedMatch) => string | null;
    /** Share of matches the top archetype must hold. */
    minShare?: number;
  },
): string | null {
  const minShare = o.minShare ?? 0.6;
  const counts = new Map<string, number>();
  let total = 0;
  for (const m of matches) {
    const fmt = o.formatFor(m);
    const name = o.myArchetypeFor(m);
    const slug = archetypeSlug(fmt, name);
    if (!slug) continue;
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
    total++;
  }
  if (!total) return null;
  let best: string | null = null;
  let bestN = 0;
  for (const [slug, n] of counts) {
    if (n > bestN) {
      best = slug;
      bestN = n;
    }
  }
  return best && bestN / total >= minShare ? best : null;
}

/** Find a personal row by meta deck name / archetype label (Daily + DeckView chips). */
export function recordForArchetypeName(
  records: readonly PersonalRecord[],
  formatId: FormatId | string | null | undefined,
  name: string | null | undefined,
): PersonalRecord | null {
  const slug = archetypeSlug(formatId, name);
  if (slug) {
    const hit = records.find((r) => r.slug === slug);
    if (hit) return hit;
  }
  const want = String(name ?? "")
    .trim()
    .toLowerCase();
  if (!want) return null;
  const compact = want.replace(/[^a-z0-9]+/g, "");
  return (
    records.find((r) => r.label.toLowerCase() === want) ??
    records.find((r) => r.label.toLowerCase().replace(/[^a-z0-9]+/g, "") === compact) ??
    null
  );
}

