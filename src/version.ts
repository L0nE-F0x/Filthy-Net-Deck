export const APP_VERSION = "2.6.2";
export const APP_NAME = "Filthy Net Deck";
export const APP_SLUG = "filthy-net-deck";

/**
 * Player-facing highlights for THIS version — shown once after an update
 * installs (see WhatsNew in StatusBanners). Update alongside APP_VERSION.
 */
export const WHATS_NEW: string[] = [
  "Overlay library counts are exact: cards no longer vanish from the count each time they change zone, so the lands-left read finally matches the deck",
  "Cards shuffled or put back on top of the library return to the count instead of staying gone",
  "A modal or Adventure card cast as its other half is subtracted from the card your deck actually registered"
];
