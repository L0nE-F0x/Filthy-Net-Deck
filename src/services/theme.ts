/** Dark/light appearance (surface polarity). */
export type ThemeMode = "dark" | "light";

/**
 * Planeswalker accent skins — layered on top of dark/light via `data-skin`.
 * Classic is the product default (no attribute).
 */
export type SkinId =
  | "classic"
  | "chandra"
  | "teferi"
  | "liliana"
  | "ajani"
  | "elspeth";

export interface SkinMeta {
  id: SkinId;
  name: string;
  walker: string;
  blurb: string;
  /** Preview swatches for the picker. */
  swatches: [string, string, string];
}

export const SKINS: SkinMeta[] = [
  {
    id: "classic",
    name: "Classic",
    walker: "Filthy default",
    blurb: "Ink & gold — the original look",
    swatches: ["#0a0b10", "#e4c06a", "#4a7fd4"],
  },
  {
    id: "chandra",
    name: "Chandra",
    walker: "Chandra Nalaar",
    blurb: "Reds, embers, molten gold",
    swatches: ["#1a0806", "#ff6b2c", "#ffc14a"],
  },
  {
    id: "teferi",
    name: "Teferi",
    walker: "Teferi, Time Raveler",
    blurb: "Cool blues & ivory whites",
    swatches: ["#071018", "#7ec8ff", "#e8f2ff"],
  },
  {
    id: "liliana",
    name: "Liliana",
    walker: "Liliana Vess",
    blurb: "Deep violets & deathly pinks",
    swatches: ["#0c0614", "#a855f7", "#f0abfc"],
  },
  {
    id: "ajani",
    name: "Ajani",
    walker: "Ajani Goldmane",
    blurb: "Warm white-gold & tawny amber",
    swatches: ["#12100a", "#f5d76e", "#c4a35a"],
  },
  {
    id: "elspeth",
    name: "Elspeth",
    walker: "Elspeth Tirel",
    blurb: "Steel white & noble gold",
    swatches: ["#0c0e14", "#f0e6c8", "#d4af37"],
  },
];

const THEME_ATTR = "data-theme";
const SKIN_ATTR = "data-skin";

const SKIN_IDS = new Set<string>(SKINS.map((s) => s.id));

export function isSkinId(v: unknown): v is SkinId {
  return typeof v === "string" && SKIN_IDS.has(v);
}

/** Apply dark/light polarity to the document root. Dark = no attribute. */
export function applyTheme(theme: ThemeMode): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "light") {
    root.setAttribute(THEME_ATTR, "light");
  } else {
    root.removeAttribute(THEME_ATTR);
  }
}

/** Apply planeswalker accent skin. Classic removes the attribute. */
export function applySkin(skin: SkinId): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (skin === "classic") {
    root.removeAttribute(SKIN_ATTR);
  } else {
    root.setAttribute(SKIN_ATTR, skin);
  }
}

/** Apply both axes (order: skin then mode so light overrides stay correct). */
export function applyAppearance(theme: ThemeMode, skin: SkinId): void {
  applySkin(skin);
  applyTheme(theme);
}

/**
 * Read theme + skin from localStorage prefs before React mounts so the first
 * paint doesn't flash the wrong palette.
 */
export function bootThemeFromStorage(): { theme: ThemeMode; skin: SkinId } {
  let theme: ThemeMode = "dark";
  let skin: SkinId = "classic";
  try {
    const raw = localStorage.getItem("bbi.prefs");
    if (raw) {
      const parsed = JSON.parse(raw) as { theme?: string; skin?: string };
      if (parsed.theme === "light") theme = "light";
      if (isSkinId(parsed.skin)) skin = parsed.skin;
    }
  } catch {
    /* ignore */
  }
  applyAppearance(theme, skin);
  return { theme, skin };
}
