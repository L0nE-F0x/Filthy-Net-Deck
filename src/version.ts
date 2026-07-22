export const APP_VERSION = "2.4.1";
export const APP_NAME = "Filthy Net Deck";
export const APP_SLUG = "filthy-net-deck";

/**
 * Player-facing highlights for THIS version — shown once after an update
 * installs (see WhatsNew in StatusBanners). Update alongside APP_VERSION.
 */
export const WHATS_NEW: string[] = [
  "Alerts actually show up — the first one each session was silently swallowed, which also left Quit unresponsive until you killed the app from Task Manager",
  "Quit from the tray icon now really quits",
  "Alerts are one thing again: the always-on-top card over Arena, no Windows banner that a fullscreen game mutes anyway",
  "Fixed set-gallery cards that showed a broken image instead of their art"
];
