/** Mirrors website/meta/sets.json from the pipeline. */

export type SetStatus =
  | "announced"
  | "spoiling"
  | "live_on_arena"
  | "released";

export type DateConfidence = "official" | "scryfall" | "estimated" | "override" | "unknown";

export type FormatLegality = "legal" | "not_legal" | "banned" | "restricted" | string;

/** Official WotC YouTube announce trailer (curated in set-trailers.json). */
export interface SetTrailerInfo {
  youtubeId: string;
  title?: string | null;
}

/**
 * An unconfirmed card spotted on a visual-spoiler aggregator (MythicSpoiler)
 * before Scryfall has cataloged it. Rendered from its source image URL, clearly
 * labeled unverified, and dropped by the pipeline the moment Scryfall catches up.
 */
export interface FreshSpoilerCard {
  /** Normalized slug (also the dedup key vs Scryfall names). */
  slug: string;
  /** Best-effort label only — the card image carries the real name. */
  name: string;
  /** Absolute image URL on the source site. */
  image: string;
  /** e.g. "mythicspoiler". */
  source: string;
  /** Link back to the source page. */
  sourceUrl: string;
  /** YYYY-MM-DD the card appeared on the aggregator, when known. */
  spoiledAt?: string | null;
}

export interface SetPreviewCard {
  name: string;
  scryfallId: string;
  rarity: string;
  collectorNumber?: string;
  typeLine?: string;
  manaCost?: string;
  cmc?: number;
  /** Printed face colours (may be empty on lands). */
  colors?: string[];
  /** Scryfall colour identity — lands and filter chips prefer this. */
  colorIdentity?: string[];
  /** Token from the related token set (or type line). Absent on older feeds. */
  isToken?: boolean;
  oracleText?: string;
  legalities?: {
    standard?: FormatLegality;
    pioneer?: FormatLegality;
  };
  scryfallUri?: string | null;
  /** Cache-busting stamp from Scryfall's image_uris; some scans 404 without it. */
  imageVersion?: string | null;
  /**
   * YYYY-MM-DD the card was spoiled. Official Scryfall `preview.previewed_at`
   * when present, else the MythicSpoiler date header, else the scan ingest day.
   * Absent on older feeds / cards with no known spoiler day.
   */
  spoiledAt?: string | null;
}

export interface UpcomingSet {
  code: string;
  name: string;
  setType: string;
  iconSvg: string | null;
  scryfallUri: string;
  cardCount: number;
  spoiledCount: number;
  dates: {
    tabletop: string | null;
    arena: string | null;
    spoilerStart: string | null;
    prerelease: string | null;
  };
  datesConfidence: {
    tabletop: DateConfidence;
    arena: DateConfidence;
    spoilerStart: DateConfidence;
    prerelease: DateConfidence;
  };
  heroScryfallId: string | null;
  /** Compact newest-first rail on the set card */
  previews: SetPreviewCard[];
  /** Full spoiled gallery (collector order). May equal previews on tiny sets. */
  cards?: SetPreviewCard[];
  /**
   * Related token-set cards (tfra, twoe, …). Separate from `cards` so older
   * app builds keep showing the playable gallery only. Absent when the set
   * has no tokens or the feed predates this field.
   */
  tokens?: SetPreviewCard[];
  /**
   * Unconfirmed cards from a visual-spoiler source (MythicSpoiler) that Scryfall
   * hasn't cataloged yet. Absent on older feeds / when nothing is fresh.
   */
  freshSpoilers?: FreshSpoilerCard[];
  overrideSource: string | null;
  notes: string | null;
  status: SetStatus;
  /** Official announce trailer when curated — absent on older feeds / unknown sets. */
  trailer?: SetTrailerInfo | null;
}

/** One row of a format's set pool (Format hub). */
export interface FormatSetInfo {
  code: string;
  name: string;
  iconSvg?: string | null;
  releasedAt?: string | null;
  cardCount?: number;
  /** Standard only — from the rotation calendar (whatsinstandard). */
  enterDate?: string | null;
  exitDate?: string | null;
  /** e.g. "Q1 2027" when no exact exit date is published yet. */
  exitRough?: string | null;
}

export interface BannedCard {
  name: string;
  scryfallId?: string;
  setCode?: string | null;
  reason?: string | null;
}

/** Which cards leave Standard at the next rotation (Standard only). */
export interface RotationImpact {
  /** Exact rotation date (YYYY-MM-DD) when whatsinstandard has one. */
  nextDate: string | null;
  /** Rough label ("Q1 2027") used only when no exact date is published yet. */
  roughLabel: string | null;
  /** Scryfall set codes rotating out together. */
  setCodes: string[];
  /** Lowercased canonical names of cards that leave Standard. */
  cardNames: string[];
}

export interface FormatHub {
  standard?: { sets: FormatSetInfo[]; bans: BannedCard[]; rotation?: RotationImpact | null };
  pioneer?: { sinceDate?: string; sets: FormatSetInfo[]; bans: BannedCard[] };
  sources?: string[];
}

export interface SetsBundle {
  generatedAt: string;
  date: string;
  version: string;
  policy?: {
    arenaFirst?: boolean;
    noAlchemy?: boolean;
    formats?: string;
    arenaDates?: string;
    futureSets?: string;
  };
  sources: string[];
  sets: UpcomingSet[];
  /** Legality / rotation / ban hub — null or absent on older feeds. */
  formats?: FormatHub | null;
  /**
   * Roadmap-announced sets Scryfall hasn't cataloged yet (curated in the
   * pipeline's future-sets.json, each with a source link). Absent on older
   * feeds — hide the section then.
   */
  futureSets?: FutureSet[];
}

/** A roadmap-announced set with no Scryfall row yet (curated + sourced). */
export interface FutureSet {
  name: string;
  /** "multiverse" = Magic IP; "universes-beyond" = outside IP. */
  kind: "multiverse" | "universes-beyond";
  /** ISO date or YYYY-MM when only the month is known — used for sorting. */
  sortDate: string | null;
  /** Display label, e.g. "February 5, 2027" or "April 2027". */
  dateLabel: string | null;
  /** official = WotC announced it; reported = press/inferred from schedule. */
  confidence: "official" | "reported";
  notes: string | null;
  sourceName: string | null;
  sourceUrl: string;
  /** Official announce trailer when curated. */
  trailer?: SetTrailerInfo | null;
}

/** Playable gallery only (no tokens). Prefer full cards; fall back to previews. */
export function setPlayableCards(set: UpcomingSet): SetPreviewCard[] {
  if (set.cards?.length) return set.cards;
  return set.previews || [];
}

/** Playable gallery plus related tokens (for the open-set filter). */
export function setGalleryCards(set: UpcomingSet): SetPreviewCard[] {
  const cards = setPlayableCards(set);
  const tokens = set.tokens?.length ? set.tokens : [];
  return tokens.length ? [...cards, ...tokens] : cards;
}

export function isFormatLegal(
  card: SetPreviewCard,
  format: "standard" | "pioneer",
): boolean {
  const v = card.legalities?.[format];
  return v === "legal" || v === "restricted";
}
