export type PlayMode = "bo1" | "bo3";

export type FormatId = "standard" | "pioneer";

export type ManaColor = "W" | "U" | "B" | "R" | "G" | "C";

export type Page =
  | "daily"
  | "format"
  | "deck"
  | "meta"
  | "sets"
  | "stats"
  | "matchups"
  | "climb"
  /** Standalone Brew Lab list clinic (v2.0). */
  | "brewlab"
  /** Standalone Format Hub (legality / rotation / bans). Not FormatView. */
  | "formats"
  | "settings";

export interface CardEntry {
  count: number;
  name: string;
  scryfallId?: string;
  /** Real mana value from Scryfall (embedded by the pipeline) */
  cmc?: number;
  /** True when the card's front face is a land */
  land?: boolean;
  /** Front-face type bucket from Scryfall (newer feeds only) */
  type?:
    | "creature"
    | "planeswalker"
    | "instant"
    | "sorcery"
    | "enchantment"
    | "artifact"
    | "battle"
    | "other";
}

export interface Matchup {
  vs: string;
  favor: "favored" | "even" | "unfavored";
  notes: string;
}

export interface SideboardLine {
  vs: string;
  in: string[];
  out: string[];
  notes: string;
}

export interface DeckSource {
  name: string;
  url: string;
}

export interface Deck {
  id: string;
  name: string;
  format: FormatId;
  mode: PlayMode;
  /** Rank within the day's 8 for this format+mode (1 = top pick) */
  rank?: number;
  tier: 1 | 2 | 3;
  colors: ManaColor[];
  archetype: string;
  description: string;
  mainboard: CardEntry[];
  sideboard: CardEntry[];
  matchups: Matchup[];
  sideboardGuide: SideboardLine[];
  arenaImport: string;
  sources: DeckSource[];
  metaShare?: number;
  commander?: string;
  /** Signature cards from the metagame source (e.g. Goldfish tile) — used for art strips */
  keyCards?: string[];
  /** authoritative = Goldfish/Melee export; fallback = offline pack */
  listQuality?: "authoritative" | "partial" | "fallback";
  listNote?: string;
}

export interface FormatTier {
  tier: 1 | 2 | 3;
  archetypes: string[];
}

export interface FormatMeta {
  id: FormatId;
  name: string;
  featured?: boolean;
  shortLabel: string;
  /** Exactly 8 recommended deck ids for Bo1, ranked */
  bo1DeckIds: string[];
  /** Exactly 8 recommended deck ids for Bo3, ranked */
  bo3DeckIds: string[];
  /** @deprecated use bo1DeckIds[0] — kept for older feeds */
  bo1?: { deckId: string };
  /** @deprecated use bo3DeckIds[0] */
  bo3?: { deckId: string };
  tiers: FormatTier[];
  metaNotes: string;
  metaShareTop?: { name: string; pct: number }[];
}

export type TournamentPlatform = "paper" | "mtgo" | "mtga";

export interface TournamentResult {
  id: string;
  name: string;
  format: FormatId | string;
  platform: TournamentPlatform;
  date: string;
  url: string;
  players?: number;
  topDecks: { place: number; pilot?: string; archetype: string }[];
  notes?: string;
  source?: string;
}

export interface MetaBundle {
  generatedAt: string;
  date: string;
  formats: FormatMeta[];
  decks: Record<string, Deck>;
  tournaments: TournamentResult[];
  sources: string[];
  version: string;
  decksPerFormat?: number;
  /** Pipeline provenance (written by build-meta.mjs) */
  pipeline?: {
    authoritativeLists?: number;
    failedLists?: number;
    listPolicy?: string;
    ranLive?: boolean;
    sourcesDetail?: string[];
  };
}
