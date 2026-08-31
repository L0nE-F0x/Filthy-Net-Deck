import "./catalogs";

export { LOCALE_IDS, LOCALE_NATIVE, isLocaleId, isLocalePref } from "./locales";
export type { LocaleId, LocalePref } from "./locales";
export { detectSystemLocale, normalizeLocale } from "./detect";
export {
  applyLocalePref,
  bootLocaleFromStorage,
  getLocale,
  lookup,
  readLocalePref,
  resolvedLocale,
  setResolvedLocale,
  subscribeLocale,
  t,
  writeLocalePref,
} from "./t";
export type { MessageKey, Messages } from "./t";
export { useLocale } from "./useLocale";
export { en } from "./en";
