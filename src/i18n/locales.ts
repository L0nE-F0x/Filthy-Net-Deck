/** Arena client languages (WotC FAQ 2026-07-08). English is the source catalog. */
export const LOCALE_IDS = [
  "en",
  "es",
  "fr",
  "de",
  "it",
  "pt-BR",
  "ja",
  "ko",
] as const;

export type LocaleId = (typeof LOCALE_IDS)[number];

/** Stored pref: follow the OS, or lock a catalog. */
export type LocalePref = LocaleId | "system";

export const LOCALE_NATIVE: Record<LocaleId, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  it: "Italiano",
  "pt-BR": "Português (Brasil)",
  ja: "日本語",
  ko: "한국어",
};

export function isLocaleId(v: unknown): v is LocaleId {
  return typeof v === "string" && (LOCALE_IDS as readonly string[]).includes(v);
}

export function isLocalePref(v: unknown): v is LocalePref {
  return v === "system" || isLocaleId(v);
}
