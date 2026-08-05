/**
 * B1 — Local opponent-archetype inference.
 *
 * Given Arena grpIds observed on the opponent seat (from the GRE stream the
 * tracker already tails), score today's ranked meta lists by distinctive card
 * overlap. Fully offline after names resolve; nothing is uploaded.
 *
 * Scoring is inverse-document-frequency weighted so staples shared across half
 * the field (Lessons, Tablets, dual lands) barely move the needle, while cards
 * that only one archetype plays (Gran-Gran, Inevitable Defeat, …) lock the
 * guess. That keeps Jeskai Lessons / Izzet Lessons / 4c Control from collapsing
 * into each other just because they all cast Lesson cards.
 */

import type { Deck, ManaColor } from "../types/meta";
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
  /**
   * How much better the top score must be than the runner-up (default 0.12 =
   * 12% relative margin). Prevents coin-flip guesses between near-twins.
   */
  minMargin?: number;
}

function deckCardPool(deck: Deck): {
  all: Set<string>;
  distinctive: Set<string>;
  key: Set<string>;
} {
  const all = new Set<string>();
  const distinctive = new Set<string>();
  const key = new Set<string>();
  for (const c of deck.mainboard ?? []) {
    const n = normalizeCardName(c.name);
    if (!n) continue;
    all.add(n);
    if (!c.land) distinctive.add(n);
  }
  // Sideboard carries archetype tells in Bo3 (and sometimes Bo1 side-in tech).
  for (const c of deck.sideboard ?? []) {
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
      key.add(n);
    }
  }
  return { all, distinctive, key };
}

/** Document frequency of each distinctive card across the candidate field. */
export function buildCardDocumentFrequency(
  candidates: Deck[],
): Map<string, number> {
  const df = new Map<string, number>();
  for (const deck of candidates) {
    const { distinctive } = deckCardPool(deck);
    for (const n of distinctive) {
      df.set(n, (df.get(n) ?? 0) + 1);
    }
  }
  return df;
}

/**
 * IDF weight: cards in one list score ~log(N), staples shared by half the
 * field score near zero. Floor keeps a tiny residual so pure density still
 * breaks pure ties.
 */
export function cardIdfWeight(
  name: string,
  df: Map<string, number>,
  nDecks: number,
): number {
  const d = df.get(name) ?? 0;
  if (nDecks <= 0) return 1;
  return Math.log((nDecks + 1) / (d + 0.5));
}

/**
 * Soft color-identity pressure. When every candidate that plays a seen card
 * shares a color, that color is "observed"; candidates missing an observed
 * color are nudged down (not eliminated — hybrid cards and splash decks exist).
 */
type PipColor = Exclude<ManaColor, "C">;

function observedColorsFromHits(
  hitNames: string[],
  candidates: Deck[],
  df: Map<string, number>,
): Set<PipColor> {
  const observed = new Set<PipColor>();
  for (const n of hitNames) {
    // Only exclusive / rare cards vote — dual-land staples would paint every
    // color on every deck.
    if ((df.get(n) ?? 0) > Math.max(2, candidates.length * 0.35)) continue;
    const colors: PipColor[] = [];
    let any = false;
    for (const d of candidates) {
      const { distinctive } = deckCardPool(d);
      if (!distinctive.has(n)) continue;
      any = true;
      for (const c of d.colors ?? []) {
        if (c !== "C") colors.push(c);
      }
    }
    if (!any || !colors.length) continue;
    // Intersection of colors across every deck that plays this card.
    const uniq = [...new Set(colors)];
    const shared = uniq.filter((c) =>
      candidates.every((d) => {
        const { distinctive } = deckCardPool(d);
        if (!distinctive.has(n)) return true;
        return (d.colors ?? []).includes(c);
      }),
    );
    for (const c of shared) observed.add(c);
  }
  return observed;
}

function colorFitPenalty(
  deck: Deck,
  observed: Set<PipColor>,
): number {
  if (observed.size === 0) return 0;
  const colors = new Set((deck.colors ?? []).filter((c) => c !== "C"));
  if (colors.size === 0) return 0;
  let missing = 0;
  for (const c of observed) {
    if (!colors.has(c)) missing++;
  }
  // Each observed color the deck lacks costs ~0.55 score points.
  return missing * 0.55;
}

export type ScoredDeck = Omit<ArchetypeGuess, "confidence"> & {
  score: number;
  /** IDF-weighted hit mass (before color / density terms). */
  weightedHits: number;
};

/**
 * Score one deck against the set of normalized card names the opponent has
 * shown. Pure — no I/O. Pass the field-wide DF map so rare cards outrank staples.
 */
export function scoreDeckAgainstSeen(
  seenNames: Set<string>,
  deck: Deck,
  df?: Map<string, number>,
  nDecks?: number,
  observedColors?: Set<PipColor>,
): ScoredDeck {
  const { all, distinctive, key } = deckCardPool(deck);
  const n = Math.max(1, nDecks ?? 1);
  const freq = df ?? new Map<string, number>();
  const hits: string[] = [];
  let distinctiveHits = 0;
  let weightedHits = 0;
  for (const name of seenNames) {
    if (!all.has(name)) continue;
    // Prefer displaying the deck's casing: scan mainboard for original name.
    const original =
      deck.mainboard?.find((c) => normalizeCardName(c.name) === name)?.name ??
      deck.sideboard?.find((c) => normalizeCardName(c.name) === name)?.name ??
      deck.keyCards?.find((k) => normalizeCardName(k) === name) ??
      name;
    hits.push(original);
    if (distinctive.has(name)) {
      distinctiveHits++;
      let w = cardIdfWeight(name, freq, n);
      // Signature tile cards are worth more than random one-ofs.
      if (key.has(name)) w *= 1.65;
      // Exclusive field presence (df === 1) is the strongest tell we have.
      if ((freq.get(name) ?? 0) <= 1) w *= 1.35;
      weightedHits += w;
    }
  }
  const pool = Math.max(1, distinctive.size);
  const density = distinctiveHits / pool;
  // Rank by weighted rarity mass first, then raw distinctive count, then
  // density as a weak denser-list tiebreak.
  const colorPenalty = observedColors
    ? colorFitPenalty(deck, observedColors)
    : 0;
  const score =
    weightedHits * 4 +
    distinctiveHits * 1.5 +
    hits.length * 0.25 +
    density -
    colorPenalty;
  return {
    archetype: deck.archetype || deck.name,
    deckId: deck.id,
    hits,
    distinctiveHits,
    poolSize: distinctive.size,
    weightedHits,
    score,
  };
}

export function confidenceFromHits(
  distinctiveHits: number,
  poolSize: number,
  seenDistinctive: number,
  /** 0..1 how clearly #1 beat #2 (optional, defaults to mid). */
  margin = 0.5,
  /** Weighted rarity mass for this guess (optional). */
  weightedHits = 0,
): number {
  if (distinctiveHits <= 0) return 0;
  const pool = Math.max(1, poolSize);
  const coverage = distinctiveHits / pool;
  // Sample quality: more seen cards → higher trust, caps at 6 distinctive.
  const sample = Math.min(1, seenDistinctive / 6);
  // Need multiple signature cards before calling it a lock.
  const depth = Math.min(1, distinctiveHits / 4);
  // Exclusive / rare hits push confidence even when raw count is modest.
  const rarity = Math.min(1, weightedHits / 3.5);
  const marginTerm = Math.min(1, Math.max(0, margin));
  return (
    Math.round(
      Math.min(
        1,
        coverage * 0.25 +
          sample * 0.2 +
          depth * 0.2 +
          rarity * 0.2 +
          marginTerm * 0.15,
      ) * 1000,
    ) / 1000
  );
}

/**
 * Best meta-deck guess for the cards the opponent has revealed.
 * Returns null when evidence is too thin or the field is a near-tie.
 */
export function inferOpponentArchetype(
  seenGrpIds: number[] | undefined | null,
  resolveName: NameResolver,
  candidates: Deck[],
  opts?: InferOptions,
): ArchetypeGuess | null {
  const minHits = opts?.minHits ?? 2;
  const minConfidence = opts?.minConfidence ?? 0.35;
  const minMargin = opts?.minMargin ?? 0.12;
  if (!seenGrpIds?.length || !candidates.length) return null;

  const seenNames = new Set<string>();
  for (const id of seenGrpIds) {
    const name = resolveName(id);
    if (!name) continue;
    const n = normalizeCardName(name);
    if (n) seenNames.add(n);
  }
  if (seenNames.size === 0) return null;

  const df = buildCardDocumentFrequency(candidates);
  const nDecks = candidates.length;

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

  // First pass: raw hits so we can derive soft color observations.
  const prelimHits: string[] = [];
  for (const n of seenNames) {
    for (const d of candidates) {
      const { distinctive } = deckCardPool(d);
      if (distinctive.has(n)) {
        prelimHits.push(n);
        break;
      }
    }
  }
  const observed = observedColorsFromHits(prelimHits, candidates, df);

  const scored: ScoredDeck[] = [];
  for (const deck of candidates) {
    const s = scoreDeckAgainstSeen(seenNames, deck, df, nDecks, observed);
    if (s.distinctiveHits < minHits && s.hits.length < minHits + 1) continue;
    scored.push(s);
  }
  if (!scored.length) return null;

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      b.weightedHits - a.weightedHits ||
      b.distinctiveHits - a.distinctiveHits,
  );

  // Collapse near-duplicate archetype names: keep the best list per label so
  // Bo1/Bo3 twins of the same deck don't invent a fake runner-up margin.
  const byArch = new Map<string, ScoredDeck>();
  for (const s of scored) {
    const prev = byArch.get(s.archetype);
    if (!prev || s.score > prev.score) byArch.set(s.archetype, s);
  }
  const unique = [...byArch.values()].sort((a, b) => b.score - a.score);
  const best = unique[0];
  const second = unique[1];

  const relativeMargin =
    second && best.score > 0
      ? (best.score - second.score) / best.score
      : 1;
  // Thin margin + both have real hits → refuse rather than coin-flip.
  if (
    second &&
    second.distinctiveHits >= minHits &&
    relativeMargin < minMargin &&
    best.weightedHits - second.weightedHits < 0.8
  ) {
    return null;
  }

  const confidence = confidenceFromHits(
    best.distinctiveHits,
    best.poolSize,
    seenDistinctive,
    relativeMargin,
    best.weightedHits,
  );
  if (confidence < minConfidence) return null;

  return {
    archetype: best.archetype,
    deckId: best.deckId,
    hits: best.hits,
    distinctiveHits: best.distinctiveHits,
    confidence,
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

/** Which matches' revealed cards feed the per-opponent deck read. */
export type SeenScope = "recent" | "all";

export interface OpponentSeenSelection {
  /** Deduped Arena grpIds to infer from (most-recent match first). */
  grpIds: number[];
  /** How many matches contributed cards (1 for "recent"). */
  matchCount: number;
  /** Total matches vs this opponent that revealed any card. */
  seenMatchCount: number;
  /** endedAt of the freshest contributing match (for labeling). */
  sourceEndedAt: number | null;
  /** bestOf of the freshest contributing match — picks Bo1 vs Bo3 lists. */
  sourceBestOf: number | null;
}

type SeenMatch = Pick<TrackedMatch, "opponentSeen" | "endedAt" | "bestOf">;

/**
 * Pick the opponent grpIds to infer from. "recent" uses only the most recent
 * match that revealed cards (represents one specific deck); "all" unions every
 * such match (denser signal, but can blend decks a player brought on different
 * days). Pure — no I/O.
 */
export function selectOpponentSeenGrpIds(
  matches: SeenMatch[],
  scope: SeenScope,
): OpponentSeenSelection {
  const seen = (matches ?? [])
    .filter((m) => (m.opponentSeen?.length ?? 0) > 0)
    .sort((a, b) => b.endedAt - a.endedAt); // freshest first
  const empty: OpponentSeenSelection = {
    grpIds: [],
    matchCount: 0,
    seenMatchCount: 0,
    sourceEndedAt: null,
    sourceBestOf: null,
  };
  if (!seen.length) return empty;

  const source = seen[0];
  const contributing = scope === "recent" ? [source] : seen;
  const grpIds: number[] = [];
  const dedupe = new Set<number>();
  for (const m of contributing) {
    for (const id of m.opponentSeen ?? []) {
      if (dedupe.has(id)) continue;
      dedupe.add(id);
      grpIds.push(id);
    }
  }
  return {
    grpIds,
    matchCount: contributing.length,
    seenMatchCount: seen.length,
    sourceEndedAt: source.endedAt ?? null,
    sourceBestOf: source.bestOf ?? null,
  };
}
