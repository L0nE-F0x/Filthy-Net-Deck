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

/**
 * What the tracker knows about one revealed card. A bare string (name only) is
 * still accepted — color correction simply stays off for those callers.
 */
export interface SeenCardInfo {
  name: string;
  /** Front-face mana cost, e.g. "{1}{W}{B}". */
  manaCost?: string | null;
  typeLine?: string | null;
  isLand?: boolean | null;
  /** Scryfall color identity — the only color signal lands carry. */
  colorIdentity?: readonly string[] | null;
}

export type NameResolver = (
  grpId: number,
) => string | SeenCardInfo | null | undefined;

export interface ArchetypeGuess {
  /** Display label — color-corrected when the opponent showed off-list colors. */
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
  /** The ranked list's own name (differs from `archetype` when corrected). */
  baseArchetype: string;
  /** True when colors the opponent proved forced a relabel of the shell. */
  colorAdjusted: boolean;
  /** Colors the opponent demonstrably has (cast pips / mono-colored lands). */
  observedColors: PipColor[];
  /**
   * True when no meta list matched and the label is a generic color+strategy
   * read (e.g. "Gruul Midrange") derived from the opponent's own cards.
   */
  macroFallback?: boolean;
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
  /**
   * When no list passes the gates, fall back to a generic color+macro label
   * ("Azorius Control") read off the opponent's own cards (default true).
   */
  macroFallback?: boolean;
  /**
   * Basic land types Arena reported for the opponent — `TrackedMatch`/
   * `LiveMatch` `opponentBasics`. Hard colour evidence, and the only correct
   * way to read a basic: its grpId is not a stable identity.
   */
  basicLandTypes?: readonly string[] | null;
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

export type PipColor = Exclude<ManaColor, "C">;

function isPipColor(c: string): c is PipColor {
  return c === "W" || c === "U" || c === "B" || c === "R" || c === "G";
}

/**
 * Colors a mana cost proves. A plain `{B}` pip means they produced black mana —
 * hard evidence. Hybrid (`{W/B}`), twobrid (`{2/W}`) and Phyrexian (`{B/P}`)
 * pips are payable other ways, so they only count as soft evidence.
 */
export function colorsFromManaCost(cost: string | null | undefined): {
  hard: Set<PipColor>;
  soft: Set<PipColor>;
} {
  const hard = new Set<PipColor>();
  const soft = new Set<PipColor>();
  if (!cost) return { hard, soft };
  const re = /\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cost)) !== null) {
    const sym = m[1].trim().toUpperCase();
    if (!sym) continue;
    if (isPipColor(sym)) {
      hard.add(sym);
      continue;
    }
    for (const part of sym.split("/")) {
      if (isPipColor(part)) soft.add(part);
    }
  }
  for (const c of hard) soft.delete(c);
  return { hard, soft };
}

export interface ColorEvidence {
  /** Colors the opponent provably has — off-colour lists are near-eliminated. */
  required: Set<PipColor>;
  /** Weaker hints (hybrid pips, duals, colors inferred from the field). */
  soft: Set<PipColor>;
  /**
   * Every colour that appears anywhere in what they revealed — pips, hybrids,
   * and the colour identity of their lands. A colour *absent* from this set
   * after a real sample of their deck is evidence they are not playing it.
   */
  evidenced?: Set<PipColor>;
  /**
   * 0..1 — how much of their deck we have actually seen, which is how much the
   * absence above is worth. See `evidenceMass`.
   */
  mass?: number;
}

function emptyEvidence(): ColorEvidence {
  return { required: new Set(), soft: new Set() };
}

function isLandCard(card: SeenCardInfo): boolean {
  if (typeof card.isLand === "boolean") return card.isLand;
  return card.typeLine ? /(?:^|\s)Land\b/.test(card.typeLine) : false;
}

/**
 * Basic lands specifically — their Arena grpIds are not stable identities
 * (they vary by printing and art), so a resolved basic can name the wrong card
 * entirely. Everything else with a Land type is a unique card and resolves
 * reliably. Name is the fallback for resolvers that only return a string.
 */
function isBasicLandCard(card: SeenCardInfo): boolean {
  if (card.typeLine) return /\bBasic\b/.test(card.typeLine);
  return /^(?:snow-covered\s+)?(?:plains|island|swamp|mountain|forest|wastes)$/i.test(
    card.name.trim(),
  );
}

/** Colour a basic land of each type produces. Arena spells these `SubType_*`. */
const BASIC_LAND_COLOR: Record<string, PipColor> = {
  plains: "W",
  island: "U",
  swamp: "B",
  mountain: "R",
  forest: "G",
};

/**
 * Colors proved by the basic land types Arena reported for the opponent.
 *
 * These come off the game object's own `subtypes`, never from resolving a
 * grpId, which is what makes them trustworthy: a basic Swamp taps for black,
 * full stop. Accepts either bare types ("Swamp") or Arena's raw
 * `SubType_Swamp` form so the caller can pass the log's strings through.
 */
export function colorsFromBasicLandTypes(
  types: readonly string[] | null | undefined,
): Set<PipColor> {
  const out = new Set<PipColor>();
  for (const raw of types ?? []) {
    const key = raw.replace(/^SubType_/i, "").trim().toLowerCase();
    const color = BASIC_LAND_COLOR[key];
    if (color) out.add(color);
  }
  return out;
}

/**
 * Read colors straight off the cards the opponent actually played, rather than
 * inferring them from which meta lists happen to contain those cards. A cast
 * `{B}` spell or a land that only makes black is proof of black — no ranked
 * list needs to know the card for that to hold.
 *
 * Multi-color lands stay soft: a two-color land in play is strong but not
 * airtight (fixing lands get played for utility, and one land shouldn't hard-
 * gate a read on its own).
 *
 * `basicLandTypes` is Arena's own report of the basics the opponent revealed
 * (`TrackedMatch.opponentBasics`). Those are hard evidence — see the note on
 * the basic-land branch below for why the *resolved* version of the same land
 * is not.
 */
export function observedColorsFromSeenCards(
  cards: SeenCardInfo[],
  basicLandTypes?: readonly string[] | null,
): ColorEvidence {
  const out = emptyEvidence();
  for (const c of colorsFromBasicLandTypes(basicLandTypes)) out.required.add(c);
  for (const card of cards) {
    const identity = (card.colorIdentity ?? []).filter(isPipColor);
    if (isLandCard(card)) {
      // A NON-basic mono-colour land still proves its colour: those are unique
      // cards whose Arena ids resolve reliably.
      //
      // A *basic* never does. Basic-land grpIds are not stable identities —
      // they vary by printing and art. Verified 2026-08-11 against a real
      // Player.log: an object Arena itself described as
      // `"superTypes":["SuperType_Basic"], "subtypes":["SubType_Swamp"]`
      // carried grpId 87457, which resolves through the card API to **Island**.
      // That one phantom Island put U into `required`, and a Rakdos opponent
      // was reported as "Grixis Control" in the overlay — and, worse, would
      // have been uploaded under that archetype into the shared matchup data.
      //
      // Demoting basics to soft keeps them useful as corroboration while
      // making it impossible for a single mis-resolved land to invent a colour
      // no spell ever demonstrated. The signal itself is not lost: the tracker
      // now carries Arena's own `subtypes` for opponent basics
      // (`TrackedMatch.opponentBasics`), and those come in through the
      // `basicLandTypes` argument above as hard evidence — trustworthy exactly
      // because no id resolution happens on that path.
      const basic = isBasicLandCard(card);
      if (!basic && identity.length === 1) out.required.add(identity[0]);
      else for (const c of identity) out.soft.add(c);
      continue;
    }
    const { hard, soft } = colorsFromManaCost(card.manaCost);
    if (hard.size || soft.size) {
      for (const c of hard) out.required.add(c);
      for (const c of soft) out.soft.add(c);
      continue;
    }
    // No cost on record (tokens, unresolved faces) — identity is a weak hint.
    for (const c of identity) out.soft.add(c);
  }
  for (const c of out.required) out.soft.delete(c);
  return out;
}

/**
 * Soft color-identity pressure. When every candidate that plays a seen card
 * shares a color, that color is "observed"; candidates missing an observed
 * color are nudged down (not eliminated — hybrid cards and splash decks exist).
 */

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

function deckColorSet(deck: Deck): Set<ManaColor> {
  return new Set((deck.colors ?? []).filter((c) => c !== "C"));
}

/** Observed colors this deck's identity cannot account for. */
export function missingColors(deck: Deck, observed: Set<PipColor>): PipColor[] {
  const colors = deckColorSet(deck);
  if (colors.size === 0) return [];
  return [...observed].filter((c) => !colors.has(c));
}

/**
 * Every colour anywhere in the revealed cards — cast pips, hybrid halves, and
 * the colour identity of lands. This is the set a colour must be missing from
 * to count as *unseen*, and it is read only off the opponent's own cards, never
 * off the candidate lists, so it cannot argue in a circle.
 */
export function evidencedColors(cards: SeenCardInfo[]): Set<PipColor> {
  const out = new Set<PipColor>();
  for (const card of cards) {
    for (const c of card.colorIdentity ?? []) if (isPipColor(c)) out.add(c);
    const { hard, soft } = colorsFromManaCost(card.manaCost);
    for (const c of hard) out.add(c);
    for (const c of soft) out.add(c);
  }
  return out;
}

/**
 * How much of the opponent's deck we have actually seen, 0..1.
 *
 * Lands count for more than spells: a mana base is on the table every single
 * turn, so four lands with no red among them says far more about the absence of
 * red than four spells would. Saturates deliberately — past a point, more cards
 * do not make an absent colour any more absent.
 */
export function evidenceMass(cards: SeenCardInfo[]): number {
  let lands = 0;
  let spells = 0;
  for (const c of cards) {
    // A card whose colour we could not look up tells us nothing about which
    // colours are absent. Only cards we actually resolved count — otherwise a
    // name-only resolver would "prove" the opponent plays no colours at all
    // and eliminate the entire field.
    const known = c.manaCost != null || (c.colorIdentity?.length ?? 0) > 0;
    if (!known) continue;
    if (isLandCard(c)) lands++;
    else spells++;
  }
  return Math.min(1, lands * 0.22 + spells * 0.14);
}

function colorFitPenalty(deck: Deck, evidence: ColorEvidence): number {
  const colors = deckColorSet(deck);
  if (colors.size === 0) return 0;
  // A proven color the list can't cast is close to disqualifying: it outweighs
  // a couple of signature hits, so a black-mana opponent stops reading as
  // Mono-White Lifegain just because the white half of their deck matched.
  const hard = missingColors(deck, evidence.required).length * 3.2;
  let soft = 0;
  for (const c of evidence.soft) {
    if (!colors.has(c)) soft += 0.55;
  }
  // The other direction, which used to be free and is why a WUB opponent could
  // be reported as 4c Control: a candidate that needs a colour the opponent has
  // shown NO trace of. Absence is only evidence once there is a real sample, so
  // it scales with how much of their deck we have seen — near nothing at two
  // cards, decisive once a mana base is on the table. Without this, a four- or
  // five-colour "goodstuff" list is literally uncontradictable: it contains
  // every proven colour by construction and pays nothing for the rest.
  let unseen = 0;
  const evidenced = evidence.evidenced;
  const mass = evidence.mass ?? 0;
  if (evidenced && mass > 0) {
    for (const c of colors) {
      if (isPipColor(c) && !evidenced.has(c)) unseen += 2.4 * mass;
    }
  }
  return hard + soft + unseen;
}

export type ScoredDeck = Omit<
  ArchetypeGuess,
  "confidence" | "baseArchetype" | "colorAdjusted" | "observedColors"
> & {
  score: number;
  /** IDF-weighted hit mass (before color / density terms). */
  weightedHits: number;
  /** Hits on cards no other list in the field plays. */
  exclusiveHits: number;
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
  observedColors?: Set<PipColor> | ColorEvidence,
): ScoredDeck {
  const { all, distinctive, key } = deckCardPool(deck);
  const n = Math.max(1, nDecks ?? 1);
  const freq = df ?? new Map<string, number>();
  const hits: string[] = [];
  let distinctiveHits = 0;
  let weightedHits = 0;
  /** Hits on cards only ONE list in the field plays — a smoking gun. */
  let exclusiveHits = 0;
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
      if ((freq.get(name) ?? 0) <= 1) {
        w *= 1.35;
        exclusiveHits++;
      }
      weightedHits += w;
    }
  }
  const pool = Math.max(1, distinctive.size);
  const density = distinctiveHits / pool;
  // Everything in `all` that is not `distinctive` is a land, by construction.
  // Lands are the least discriminating cards in the format — a four-colour pile
  // plays every dual and utility land there is, so it "matches" whatever anyone
  // puts on the table. They may corroborate a read; they must never carry one,
  // so their contribution is capped at roughly one distinctive card.
  const landHits = hits.length - distinctiveHits;
  // Rank by weighted rarity mass first, then raw distinctive count, then
  // density as a weak denser-list tiebreak.
  const evidence = observedColors
    ? observedColors instanceof Set
      ? { required: new Set<PipColor>(), soft: observedColors }
      : observedColors
    : null;
  const colorPenalty = evidence ? colorFitPenalty(deck, evidence) : 0;
  const score =
    weightedHits * 4 +
    distinctiveHits * 1.5 +
    Math.min(landHits, 2) * 0.15 +
    density -
    colorPenalty;
  return {
    archetype: deck.archetype || deck.name,
    deckId: deck.id,
    hits,
    distinctiveHits,
    exclusiveHits,
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

const MONO_NAME: Record<PipColor, string> = {
  W: "Mono-White",
  U: "Mono-Blue",
  B: "Mono-Black",
  R: "Mono-Red",
  G: "Mono-Green",
};

const PAIR_NAME: Record<string, string> = {
  WU: "Azorius",
  UB: "Dimir",
  BR: "Rakdos",
  RG: "Gruul",
  WG: "Selesnya",
  WB: "Orzhov",
  UR: "Izzet",
  BG: "Golgari",
  WR: "Boros",
  UG: "Simic",
};

const TRIO_NAME: Record<string, string> = {
  WUG: "Bant",
  WUB: "Esper",
  UBR: "Grixis",
  BRG: "Jund",
  WRG: "Naya",
  WBG: "Abzan",
  WUR: "Jeskai",
  UBG: "Sultai",
  WBR: "Mardu",
  URG: "Temur",
};

const COLOR_ORDER: PipColor[] = ["W", "U", "B", "R", "G"];

function colorKey(colors: Iterable<PipColor>): string {
  const set = new Set(colors);
  return COLOR_ORDER.filter((c) => set.has(c)).join("");
}

/** "WB" → "Orzhov", "W" → "Mono-White", four+ → "4c"/"5c". */
export function colorGroupName(colors: Iterable<PipColor>): string | null {
  const key = colorKey(colors);
  if (!key) return null;
  if (key.length === 1) return MONO_NAME[key as PipColor];
  if (key.length === 2) return PAIR_NAME[key] ?? null;
  if (key.length === 3) return TRIO_NAME[key] ?? null;
  return key.length === 4 ? "4c" : "5c";
}

const COLOR_WORDS = new Set(
  [
    ...Object.values(MONO_NAME),
    ...Object.values(PAIR_NAME),
    ...Object.values(TRIO_NAME),
    "4c",
    "5c",
    "Four-Color",
    "Five-Color",
  ].map((w) => w.toLowerCase()),
);

/**
 * "Mono-White Lifegain" → "Lifegain". Null when the archetype has no color
 * word to swap, so we never invent "Orzhov Domain" out of "Domain".
 */
export function archetypeTheme(archetype: string): string | null {
  const parts = archetype.trim().split(/\s+/);
  if (parts.length < 2) return null;
  if (!COLOR_WORDS.has(parts[0].toLowerCase())) return null;
  const rest = parts.slice(1).join(" ").trim();
  return rest || null;
}

/**
 * Relabel a shell when the opponent has proven colors it doesn't play. The
 * ranked list stays the closest match (it's still the right deck to compare
 * against) but the name reflects what they actually showed: a Mono-White
 * Lifegain shell plus black mana is Orzhov Lifegain, not mono-white.
 */
export function colorCorrectArchetype(
  archetype: string,
  deckColors: Iterable<ManaColor>,
  observed: Set<PipColor>,
): { archetype: string; adjusted: boolean } {
  const colors = new Set<PipColor>(
    [...deckColors].filter((c): c is PipColor => c !== "C"),
  );
  const missing = [...observed].filter((c) => !colors.has(c));
  if (!missing.length || colors.size === 0) return { archetype, adjusted: false };
  const theme = archetypeTheme(archetype);
  if (!theme) return { archetype, adjusted: false };
  const name = colorGroupName([...colors, ...missing]);
  if (!name) return { archetype, adjusted: false };
  return { archetype: `${name} ${theme}`, adjusted: true };
}

/** Rough mana value from a cost string: numerals count full, X counts 0, every other symbol group counts one pip. Null when no cost is on record. */
export function cmcFromManaCost(cost: string | null | undefined): number | null {
  if (!cost) return null;
  let total = 0;
  let seen = false;
  const re = /\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cost)) !== null) {
    seen = true;
    const sym = m[1].trim().toUpperCase();
    if (/^\d+$/.test(sym)) total += parseInt(sym, 10);
    else if (sym === "X") total += 0;
    else total += 1; // colored / hybrid / twobrid / phyrexian — one pip each
  }
  return seen ? total : null;
}

/** Counterspell names (normalized) — the hardest control tell a name can give. */
const COUNTER_NAMES = new Set([
  "negate",
  "dispel",
  "essence scatter",
  "make disappear",
  "spell pierce",
  "no more lies",
  "disdainful stroke",
  "dovin's veto",
  "absorb",
  "sinister sabotage",
  "three steps ahead",
  "counterspell",
  "mana leak",
  "quench",
  "stubborn denial",
  "mystical dispute",
  "arcane denial",
  "wash away",
  "geistlight snare",
  "spell stutter",
]);

/** Board wipes — control tell. Matched on normalized names. */
const SWEEPER_RE =
  /\b(wrath of god|day of judgment|damnation|sunfall|depopulate|temporary lockdown|vanquish the horde|blasphemous act|brotherhood's end|path of peril|storm's wrath|burn down the house|the filigree sylex|hour of revelation|farewell|supreme verdict)\b/;

/** Card selection / draw spells — control-leaning tell. */
const DRAW_RE =
  /\b(opt|consider|impulse|deduce|quick study|divination|sleight of hand|memory deluge|stock up|expressive iteration|behold the multiverse|chart a course|pieces of the puzzle|thirst for discovery|mazemind tome)\b/;

/** Cheap burn — aggro tell. */
const BURN_RE =
  /\b(shock|lightning strike|lightning bolt|play with fire|monstrous rage|skewer the critics|scorching shot|searing blaze|fiery temper|boros charm|wizard's lightning|reckless rage|strangle)\b/;

/** Mana acceleration — ramp tell. */
const RAMP_RE =
  /\b(rampant growth|cultivate|kodama's reach|llanowar elves|elvish mystic|gilded goose|paradise druid|topiary stomper|invasion of zendikar|nissa's pilgrimage|the world tree|up the beanstalk|escape to the wilds|storm the festival|old-growth troll)\b/;

/** Rituals / engine pieces — combo tell. Needs 2+ hits before Combo can win. */
const COMBO_RE =
  /\b(dark ritual|rite of flame|seething song|lotus field|underworld breach|song of creation|hullbreaker horror|omniscience|tendrils of agony|grapeshot|brain freeze|show and tell|peer into the abyss|indomitable creativity|transmogrify|greasefang, okiba boss|creative outburst)\b/;

export type MacroArchetype = "Aggro" | "Midrange" | "Control" | "Combo" | "Ramp";

/**
 * Generic color+strategy read — the floor of opponent recognition, used only
 * when NO real list passes the matching gates. Derived purely from the
 * opponent's own revealed cards: colors from cast pips / lands (hard evidence
 * first, soft land hints otherwise), strategy from curve, card types and a few
 * unmistakable card names (counterspells, sweepers, burn, rituals…).
 *
 * Conservative by design: needs 4+ non-land cards and at least one observed
 * color, and confidence is capped low (≤ 0.5) so a real list match always
 * outranks it. Returns labels like "Mono-Red Aggro" / "Azorius Control".
 */
export function macroArchetypeFallback(
  seenCards: SeenCardInfo[],
  evidence: ColorEvidence,
  seenDistinctive: number,
  minConfidence = 0.35,
): ArchetypeGuess | null {
  if (seenDistinctive < 4) return null;

  let creaturesCheap = 0;
  let creaturesMid = 0;
  let spellsCheap = 0;
  let expensive = 0;
  let walkers = 0;
  let counters = 0;
  let sweepers = 0;
  let draw = 0;
  let burn = 0;
  let rampHits = 0;
  let comboHits = 0;

  for (const card of seenCards) {
    if (isLandCard(card)) continue;
    const n = normalizeCardName(card.name);
    if (!n) continue;
    const cmc = cmcFromManaCost(card.manaCost);
    const type = card.typeLine ?? "";
    const creature = /\bCreature\b/.test(type);
    const spell = /\b(?:Instant|Sorcery)\b/.test(type);
    if (/\bPlaneswalker\b/.test(type)) walkers++;
    if (cmc != null) {
      if (creature && cmc <= 2) creaturesCheap++;
      if (creature && cmc >= 3 && cmc <= 4) creaturesMid++;
      if (spell && cmc <= 2) spellsCheap++;
      if (cmc >= 5) expensive++;
    }
    if (COUNTER_NAMES.has(n)) counters++;
    if (SWEEPER_RE.test(n)) sweepers++;
    if (DRAW_RE.test(n)) draw++;
    if (BURN_RE.test(n)) burn++;
    if (RAMP_RE.test(n)) rampHits++;
    if (COMBO_RE.test(n)) comboHits++;
  }

  const scores: [MacroArchetype, number][] = [
    [
      "Aggro",
      1.2 * creaturesCheap +
        0.9 * burn +
        0.5 * spellsCheap +
        0.3 * creaturesMid -
        0.6 * expensive,
    ],
    [
      "Control",
      1.6 * counters +
        1.6 * sweepers +
        1.0 * draw +
        0.8 * walkers +
        0.5 * expensive -
        0.6 * creaturesCheap,
    ],
    // Midrange is the default texture when nothing screams a polar plan.
    ["Midrange", 1.0 + 0.4 * creaturesMid],
    ["Ramp", rampHits >= 2 ? 1.8 * rampHits + 0.4 * expensive : -1],
    ["Combo", comboHits >= 2 ? 2.2 * comboHits : -1],
  ];
  scores.sort((a, b) => b[1] - a[1]);
  const [macro, top] = scores[0];
  const margin = top - (scores[1]?.[1] ?? 0);

  const colors = [
    ...(evidence.required.size ? evidence.required : evidence.soft),
  ].slice(0, 3);
  const group = colorGroupName(colors);
  if (!group) return null;

  const confidence =
    Math.round(
      Math.min(
        0.5,
        0.3 + 0.02 * Math.min(seenDistinctive, 8) + (margin >= 1.5 ? 0.04 : 0),
      ) * 1000,
    ) / 1000;
  if (confidence < minConfidence) return null;

  const label = `${group} ${macro}`;
  return {
    archetype: label,
    deckId: "",
    hits: [],
    distinctiveHits: 0,
    confidence,
    poolSize: 0,
    baseArchetype: label,
    colorAdjusted: false,
    observedColors: COLOR_ORDER.filter((c) => evidence.required.has(c)),
    macroFallback: true,
  };
}

/**
 * Best meta-deck guess for the cards the opponent has revealed.
 * Falls back to a generic color+macro label (macroArchetypeFallback) when no
 * list passes the gates; returns null when evidence is too thin for either.
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
  const seenCards: SeenCardInfo[] = [];
  for (const id of seenGrpIds) {
    const resolved = resolveName(id);
    if (!resolved) continue;
    const card: SeenCardInfo =
      typeof resolved === "string" ? { name: resolved } : resolved;
    if (!card.name) continue;
    const n = normalizeCardName(card.name);
    if (!n || seenNames.has(n)) continue;
    seenNames.add(n);
    seenCards.push(card);
  }
  if (seenNames.size === 0) return null;

  // Hard color evidence read off the cards themselves. Independent of the
  // ranked field, so it holds even for cards no meta list plays.
  const proven = observedColorsFromSeenCards(seenCards, opts?.basicLandTypes);

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
  for (const card of seenCards) {
    // Real type lines when the resolver has them; the field's land list is the
    // fallback for name-only resolvers.
    const known = card.isLand ?? (card.typeLine ? isLandCard(card) : null);
    const land = known ?? landish.has(normalizeCardName(card.name));
    if (!land) seenDistinctive++;
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
  const inferredColors = observedColorsFromHits(prelimHits, candidates, df);
  const evidence: ColorEvidence = {
    required: proven.required,
    soft: new Set<PipColor>([...proven.soft, ...inferredColors]),
    // Read off their cards only — `inferredColors` comes from the candidate
    // lists and must not feed back in here, or a list would end up justifying
    // its own colours.
    evidenced: evidencedColors(seenCards),
    mass: evidenceMass(seenCards),
  };
  for (const c of evidence.required) evidence.soft.delete(c);

  // When no real list passes the gates below, fall back to a generic
  // color+macro label read off the opponent's own cards, so off-meta decks
  // still get named instead of vanishing.
  const macroFallback = () =>
    opts?.macroFallback === false
      ? null
      : macroArchetypeFallback(seenCards, proven, seenDistinctive, minConfidence);

  // Once we have actually seen a sample of their deck — a mana base plus some
  // spells — a candidate that needs a colour they have shown *no trace of* is
  // out, not merely penalised. Four lands and five spells without a single red
  // card is not weak evidence against a red deck; it is the ordinary way you
  // know someone is not playing red. Below that threshold this does nothing
  // and the graded penalty in colorFitPenalty carries it.
  // Measured, not assumed: restricting this to three-plus-colour lists (on the
  // theory that a two-colour deck can hide its second colour) let the original
  // failure back in — colours claimed with no evidence went from 1.1% to 9.9%
  // of late-game reads. Applying it to every list is what holds.
  const sampleIsReal = (evidence.mass ?? 0) >= 0.65;
  const unseenColorRules = (deck: Deck) => {
    if (!sampleIsReal || !evidence.evidenced) return false;
    return (deck.colors ?? []).some(
      (c) => c !== "C" && isPipColor(c) && !evidence.evidenced!.has(c),
    );
  };

  const scored: ScoredDeck[] = [];
  for (const deck of candidates) {
    const s = scoreDeckAgainstSeen(seenNames, deck, df, nDecks, evidence);
    // Cards can overrule the colour argument, but only real ones: two cards
    // that no other list in the field plays outweigh "we have not seen red
    // yet". One does not — that is how a single shared staple used to drag a
    // whole four-colour list into the answer.
    if (unseenColorRules(deck) && s.exclusiveHits < 3) continue;
    // Real cards only. This used to read `|| s.hits.length < minHits + 1`,
    // which admitted a list on land overlap alone — three shared duals and no
    // actual spell was enough to name a deck. That is how a Dimir opponent got
    // reported as 4c Control: the four-colour list plays every land anyone
    // plays, so it out-hit the one card (Kaito) that identified the real deck.
    // One card that NO other list in the field plays identifies a deck on its
    // own — refusing to say "Dimir Midrange" when they have cast the only copy
    // of Kaito in the format is a different kind of wrong.
    if (s.distinctiveHits < minHits && s.exclusiveHits < 1) continue;
    scored.push(s);
  }
  if (!scored.length) return macroFallback();

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
    return macroFallback();
  }

  const bestDeck = candidates.find((d) => d.id === best.deckId);
  const corrected = colorCorrectArchetype(
    best.archetype,
    bestDeck?.colors ?? [],
    proven.required,
  );

  let confidence = confidenceFromHits(
    best.distinctiveHits,
    best.poolSize,
    seenDistinctive,
    relativeMargin,
    best.weightedHits,
  );
  // The shell matched but the colors didn't: it is not this exact 75, so the
  // read is a notch less certain than the raw card overlap suggests.
  if (corrected.adjusted) {
    confidence = Math.round(Math.min(confidence * 0.8, 0.8) * 1000) / 1000;
  }
  if (confidence < minConfidence) return macroFallback();

  return {
    archetype: corrected.archetype,
    baseArchetype: best.archetype,
    colorAdjusted: corrected.adjusted,
    observedColors: COLOR_ORDER.filter((c) => proven.required.has(c)),
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
    const guess = inferOpponentArchetype(m.opponentSeen, resolveName, candidates, {
      ...opts,
      basicLandTypes: m.opponentBasics,
    });
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
  /** Basic land types Arena reported across the contributing matches. */
  basicLandTypes: string[];
}

type SeenMatch = Pick<
  TrackedMatch,
  "opponentSeen" | "opponentBasics" | "endedAt" | "bestOf"
>;

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
    basicLandTypes: [],
  };
  if (!seen.length) return empty;

  const source = seen[0];
  const contributing = scope === "recent" ? [source] : seen;
  const grpIds: number[] = [];
  const dedupe = new Set<number>();
  const basics = new Set<string>();
  for (const m of contributing) {
    for (const id of m.opponentSeen ?? []) {
      if (dedupe.has(id)) continue;
      dedupe.add(id);
      grpIds.push(id);
    }
    for (const t of m.opponentBasics ?? []) basics.add(t);
  }
  return {
    grpIds,
    matchCount: contributing.length,
    seenMatchCount: seen.length,
    sourceEndedAt: source.endedAt ?? null,
    sourceBestOf: source.bestOf ?? null,
    basicLandTypes: [...basics].sort(),
  };
}
