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
