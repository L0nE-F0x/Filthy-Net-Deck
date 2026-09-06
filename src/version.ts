export const APP_VERSION = "3.7.1";
export const APP_NAME = "Filthy Net Deck";
export const APP_SLUG = "filthy-net-deck";

/**
 * Player-facing highlights for THIS version — shown once after an update
 * installs (see WhatsNew in StatusBanners). Update alongside APP_VERSION.
 */
export const WHATS_NEW: string[] = [
  "Show deck in galaxy now works for commanders — a comma in a card name no longer breaks the link, and the link survives a reload",
  "Your deck lights up in place instead of hiding every other card, so you can see where it sits in Magic",
  "Nebula and intensity controls respond again when auto-rotate is turned off",
  "Saved views work on macOS, where naming one silently did nothing",
  "Windows: restored the privacy defaults this app ships with, and asked WebView2 for the discrete GPU"
];
