/**
 * B1 — Local opponent-archetype inference.
 *
 * Given Arena grpIds observed on the opponent seat (from the GRE stream the
 * tracker already tails), score today's ranked meta lists by distinctive card
 * overlap. Fully offline after names resolve; nothing is uploaded.
 */

import type { Deck } from "../types/meta";
import type { TrackedMatch } from "../types/tracker";

export function normalizeCardName(name: string): string {
  // DFC / adventure: front face is the identity used on Goldfish tiles.
  const front = name.split("//")[0] ?? name;
  return front
    .trim()
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/\s+/g, " ");
}

export type NameResolver = (grpId: number) => string | null | undefined;

export interface ArchetypeGuess {
  archetype: string;
  deckId: string;
  /** Unique meta-list card names that matched a seen card. */
  hits: string[];
  /** Distinctive (non-land) hits — primary ranking signal. */
  distinctiveHits: number;
  /** 0..1 confidence from hit density + sample size. */
  confidence: number;
  /** How many unique non-land cards the candidate list has (for UI). */
  poolSize: number;
}

export interface InferOptions {
  /** Minimum distinctive hits before a guess is returned (default 2). */
  minHits?: number;
  /** Minimum confidence 0..1 (default 0.35). */
  minConfidence?: number;
}

function deckCardPool(deck: Deck): {
  all: Set<string>;
  distinctive: Set<string>;
} {
  const all = new Set<string>();
  const distinctive = new Set<string>();
  for (const c of deck.mainboard ?? []) {
    const n = normalizeCardName(c.name);
    if (!n) continue;
    all.add(n);
    if (!c.land) distinctive.add(n);
  }
  // Key cards from the metagame tile are high-signal even if not in the 60.
  for (const k of deck.keyCards ?? []) {
    const n = normalizeCardName(k);
    if (n) {
      all.add(n);
      distinctive.add(n);
    }
  }
  return { all, distinctive };
}

/**
 * Score one deck against the set of normalized card names the opponent has
 * shown. Pure — no I/O.
 */
export function scoreDeckAgainstSeen(
  seenNames: Set<string>,
  deck: Deck,
): Omit<ArchetypeGuess, "confidence"> & { score: number } {
  const { all, distinctive } = deckCardPool(deck);
  const hits: string[] = [];
  let distinctiveHits = 0;
  for (const n of seenNames) {
    if (!all.has(n)) continue;
    // Prefer displaying the deck's casing: scan mainboard for original name.
    const original =
      deck.mainboard?.find((c) => normalizeCardName(c.name) === n)?.name ??
      deck.keyCards?.find((k) => normalizeCardName(k) === n) ??
      n;
    hits.push(original);
    if (distinctive.has(n)) distinctiveHits++;
  }
  // Rank primarily by distinctive hits, then total hits, then denser lists.
  const pool = Math.max(1, distinctive.size);
  const density = distinctiveHits / pool;
  const score = distinctiveHits * 3 + hits.length + density;
  return {
    archetype: deck.archetype || deck.name,
    deckId: deck.id,
    hits,
    distinctiveHits,
    poolSize: distinctive.size,
    score,
  };
}

export function confidenceFromHits(
  distinctiveHits: number,
  poolSize: number,
  seenDistinctive: number,
): number {
  if (distinctiveHits <= 0) return 0;
  const pool = Math.max(1, poolSize);
  const coverage = distinctiveHits / pool;
  // Sample quality: more seen cards → higher trust, caps at 6 distinctive.
  const sample = Math.min(1, seenDistinctive / 6);
  // Need multiple signature cards before calling it a lock.
  const depth = Math.min(1, distinctiveHits / 4);
  return Math.round(Math.min(1, coverage * 0.45 + sample * 0.25 + depth * 0.3) * 1000) / 1000;
}

/**
 * Best meta-deck guess for the cards the opponent has revealed.
 * Returns null when evidence is too thin.
 */
export function inferOpponentArchetype(
  seenGrpIds: number[] | undefined | null,
  resolveName: NameResolver,
  candidates: Deck[],
  opts?: InferOptions,
): ArchetypeGuess | null {
  const minHits = opts?.minHits ?? 2;
  const minConfidence = opts?.minConfidence ?? 0.35;
  if (!seenGrpIds?.length || !candidates.length) return null;

  const seenNames = new Set<string>();
  for (const id of seenGrpIds) {
    const name = resolveName(id);
    if (!name) continue;
    const n = normalizeCardName(name);
    if (n) seenNames.add(n);
  }
  if (seenNames.size === 0) return null;

  // Count how many seen names look non-land-ish by checking against all pools.
  // (Land filtering of *seen* names is approximate without type lines.)
  const landish = new Set<string>();
  for (const d of candidates) {
    for (const c of d.mainboard ?? []) {
      if (c.land) landish.add(normalizeCardName(c.name));
    }
  }
  let seenDistinctive = 0;
  for (const n of seenNames) {
    if (!landish.has(n)) seenDistinctive++;
  }

  let best: (ReturnType<typeof scoreDeckAgainstSeen> & { confidence: number }) | null =
    null;
  for (const deck of candidates) {
    const scored = scoreDeckAgainstSeen(seenNames, deck);
    const confidence = confidenceFromHits(
      scored.distinctiveHits,
      scored.poolSize,
      seenDistinctive,
    );
    if (scored.distinctiveHits < minHits && scored.hits.length < minHits + 1) {
      continue;
    }
    if (confidence < minConfidence) continue;
    if (
      !best ||
      scored.score > best.score ||
      (scored.score === best.score && confidence > best.confidence)
    ) {
      best = { ...scored, confidence };
    }
  }
  if (!best) return null;
  return {
    archetype: best.archetype,
    deckId: best.deckId,
    hits: best.hits,
    distinctiveHits: best.distinctiveHits,
    confidence: best.confidence,
    poolSize: best.poolSize,
  };
}

export interface VsArchetypeRow {
  archetype: string;
  deckId: string | null;
  wins: number;
  losses: number;
  games: number;
  winrate: number | null;
  /** Matches that contributed (for debugging / drill-down). */
  sample: number;
  /** Last up to 5 decided results oldest→newest (W/L). */
  form: string;
}

/**
 * Aggregate personal record vs inferred opponent archetypes.
 * Matches without enough evidence are skipped (not lumped into "Unknown").
 */
export function personalVsOpponentArchetypes(
  matches: TrackedMatch[],
  resolveName: NameResolver,
  candidates: Deck[],
  opts?: InferOptions & { minGames?: number; formWindow?: number },
): VsArchetypeRow[] {
  const minGames = opts?.minGames ?? 0;
  const formWindow = opts?.formWindow ?? 5;
  const by = new Map<string, VsArchetypeRow>();
  const chronological = [...matches].sort((a, b) => a.endedAt - b.endedAt);

  for (const m of chronological) {
    if (m.result !== "win" && m.result !== "loss") continue;
    const guess = inferOpponentArchetype(m.opponentSeen, resolveName, candidates, opts);
    if (!guess) continue;
    const key = guess.archetype;
    const row =
      by.get(key) ??
      ({
        archetype: guess.archetype,
        deckId: guess.deckId,
        wins: 0,
        losses: 0,
        games: 0,
        winrate: null,
        sample: 0,
        form: "",
      } satisfies VsArchetypeRow);
    if (m.result === "win") row.wins++;
    else row.losses++;
    row.games = row.wins + row.losses;
    row.sample++;
    row.winrate = row.games ? row.wins / row.games : null;
    row.form = (row.form + (m.result === "win" ? "W" : "L")).slice(-formWindow);
    by.set(key, row);
  }

  return [...by.values()]
    .filter((r) => r.games >= minGames)
    .sort(
      (a, b) =>
        b.games - a.games ||
        (b.winrate ?? 0) - (a.winrate ?? 0) ||
        a.archetype.localeCompare(b.archetype),
    );
}

/** Compact label for UI: "Izzet Prowess · 72%" */
export function formatGuessLabel(guess: ArchetypeGuess | null): string | null {
  if (!guess) return null;
  const pct = Math.round(guess.confidence * 100);
  return `${guess.archetype} · ${pct}%`;
}
