/** Mirrors website/meta/sets.json from the pipeline. */

export type SetStatus =
  | "announced"
  | "spoiling"
  | "live_on_arena"
  | "released";

export type DateConfidence = "official" | "scryfall" | "estimated" | "override" | "unknown";

export type FormatLegality = "legal" | "not_legal" | "banned" | "restricted" | string;

export interface SetPreviewCard {
  name: string;
  scryfallId: string;
  rarity: string;
  collectorNumber?: string;
  typeLine?: string;
  manaCost?: string;
  cmc?: number;
  /** WUBRG color identity / face colors */
  colors?: string[];
  oracleText?: string;
  legalities?: {
    standard?: FormatLegality;
    pioneer?: FormatLegality;
  };
  scryfallUri?: string | null;
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
  overrideSource: string | null;
  notes: string | null;
  status: SetStatus;
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
  };
  sources: string[];
  sets: UpcomingSet[];
  /** Legality / rotation / ban hub — null or absent on older feeds. */
  formats?: FormatHub | null;
}

/** Prefer full gallery; fall back to previews for older feeds. */
export function setGalleryCards(set: UpcomingSet): SetPreviewCard[] {
  if (set.cards?.length) return set.cards;
  return set.previews || [];
}

export function isFormatLegal(
  card: SetPreviewCard,
  format: "standard" | "pioneer",
): boolean {
  const v = card.legalities?.[format];
  return v === "legal" || v === "restricted";
}
