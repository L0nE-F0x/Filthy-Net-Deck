import { detectSystemLocale } from "./detect";
import { en, type Messages } from "./en";
import { isLocaleId, isLocalePref, type LocaleId, type LocalePref } from "./locales";
import { getPath, interpolate } from "./path";

export type { Messages };

type DotPrefix<T extends string, P extends string> = P extends "" ? T : `${P}.${T}`;

export type MessageKey<T = Messages, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? DotPrefix<K, P>
    : T[K] extends Record<string, unknown>
      ? MessageKey<T[K], DotPrefix<K, P>>
      : never;
}[keyof T & string];

const PREFS_KEY = "bbi.prefs";

type CatalogMap = Record<LocaleId, Messages>;

let catalogs: CatalogMap = {
  en,
  es: en,
  fr: en,
  de: en,
  it: en,
  "pt-BR": en,
  ja: en,
  ko: en,
};

let catalogsReady = false;
let current: LocaleId = "en";
const listeners = new Set<() => void>();

export function registerCatalogs(map: Partial<CatalogMap>): void {
  catalogs = { ...catalogs, ...map, en };
  catalogsReady = true;
}

export function lookup(
  locale: LocaleId,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const hit = getPath(catalogs[locale] ?? en, key);
  const fallback = locale === "en" ? undefined : getPath(en, key);
  const raw = typeof hit === "string" ? hit : typeof fallback === "string" ? fallback : "";
  return interpolate(raw, vars);
}

export function t(
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  return lookup(current, key, vars);
}

export function getLocale(): LocaleId {
  return current;
}

export function subscribeLocale(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(): void {
  for (const fn of listeners) fn();
}

export function readLocalePref(): LocalePref {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return "system";
    const parsed = JSON.parse(raw) as { locale?: unknown };
    if (isLocalePref(parsed.locale)) return parsed.locale;
  } catch {
    /* ignore */
  }
  return "system";
}

export function resolvedLocale(pref: LocalePref = readLocalePref()): LocaleId {
  return pref === "system" ? detectSystemLocale() : pref;
}

export function setResolvedLocale(locale: LocaleId): void {
  if (current === locale) return;
  current = locale;
  emit();
}

export function applyLocalePref(pref: LocalePref): LocaleId {
  const next = resolvedLocale(pref);
  setResolvedLocale(next);
  return next;
}

export function writeLocalePref(pref: LocalePref): void {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    const obj = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    obj.locale = pref;
    localStorage.setItem(PREFS_KEY, JSON.stringify(obj));
  } catch {
    /* ignore */
  }
  applyLocalePref(pref);
}

export function bootLocaleFromStorage(): LocaleId {
  return applyLocalePref(readLocalePref());
}

export function catalogsAreReady(): boolean {
  return catalogsReady;
}

export { isLocaleId, isLocalePref };
