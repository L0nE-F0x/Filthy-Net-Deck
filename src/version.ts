export const APP_VERSION = "0.24.1";
export const APP_NAME = "Filthy Net Deck";
export const APP_SLUG = "filthy-net-deck";

/**
 * Player-facing highlights for THIS version — shown once after an update
 * installs (see WhatsNew in StatusBanners). Update alongside APP_VERSION.
 */
export const WHATS_NEW: string[] = [
  "Tracker fix — matches recorded while the app is minimized to the tray now appear in My Stats / Matchups / Climb when you open the window again",
  "Tracker re-syncs on focus, when you open those pages, and every 20s so the UI can’t stay stale while Rust keeps writing matches",
];
