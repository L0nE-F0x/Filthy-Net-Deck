import { isLocaleId, type LocaleId } from "./locales";

/**
 * Map an OS / browser tag onto an FND catalog.
 * `pt` and `pt-PT` → Brazil (Arena has no European Portuguese client).
 * Any `es-*` → one Spanish. Unknown → English.
 */
export function normalizeLocale(raw: string | null | undefined): LocaleId {
  if (!raw) return "en";
  const tag = raw.trim().replace(/_/g, "-");
  if (!tag) return "en";
  if (isLocaleId(tag)) return tag;
  const lower = tag.toLowerCase();
  if (lower.startsWith("pt")) return "pt-BR";
  if (lower.startsWith("es")) return "es";
  if (lower.startsWith("fr")) return "fr";
  if (lower.startsWith("de")) return "de";
  if (lower.startsWith("it")) return "it";
  if (lower.startsWith("ja")) return "ja";
  if (lower.startsWith("ko")) return "ko";
  if (lower.startsWith("en")) return "en";
  const primary = tag.split("-")[0];
  if (isLocaleId(primary)) return primary;
  return "en";
}

export function detectSystemLocale(): LocaleId {
  try {
    if (typeof navigator !== "undefined") {
      const list = navigator.languages?.length
        ? navigator.languages
        : navigator.language
          ? [navigator.language]
          : [];
      for (const item of list) {
        const hit = normalizeLocale(item);
        if (hit !== "en" || /^en\b/i.test(item)) return hit;
      }
    }
  } catch {
    /* ignore */
  }
  return "en";
}
