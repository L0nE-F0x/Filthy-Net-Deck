export const APP_VERSION = "2.7.2";
export const APP_NAME = "Filthy Net Deck";
export const APP_SLUG = "filthy-net-deck";

/**
 * Player-facing highlights for THIS version — shown once after an update
 * installs (see WhatsNew in StatusBanners). Update alongside APP_VERSION.
 */
export const WHATS_NEW: string[] = [
  "Snappier navigation: pages prefetch on hover and open without a full remount",
  "Fixed a splash timer that kept re-rendering the whole app after boot",
  "Leaner home screen: board paints first, coach panels follow",
];
