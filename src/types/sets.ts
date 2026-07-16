/** Mirrors website/meta/sets.json from the pipeline. */

export type SetStatus =
  | "announced"
  | "spoiling"
  | "live_on_arena"
  | "released";

export type DateConfidence = "official" | "scryfall" | "estimated" | "override" | "unknown";

export interface SetPreviewCard {
  name: string;
  scryfallId: string;
  rarity: string;
  collectorNumber?: string;
  typeLine?: string;
  manaCost?: string;
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
  previews: SetPreviewCard[];
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
