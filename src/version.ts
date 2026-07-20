export const APP_VERSION = "1.6.0";
export const APP_NAME = "Filthy Net Deck";
export const APP_SLUG = "filthy-net-deck";

/**
 * Player-facing highlights for THIS version — shown once after an update
 * installs (see WhatsNew in StatusBanners). Update alongside APP_VERSION.
 */
export const WHATS_NEW: string[] = [
  "Opponents, named: cards they play are matched to today's ranked meta — see your winrate by enemy archetype on Decks and in deck detail",
  "Game analytics on My Stats: Bo3 game-1 vs post-board winrate and a per-deck matchup table",
  "Overlay shows a live guess of the opponent's archetype mid-match",
  "Meta lists upgraded: real MTGO challenge decklists first, Goldfish fallback",
  "Settings → Export diagnostic: anonymized parser-health file (counters only — no names, no matches)"
];
