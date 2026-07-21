/**
 * Strip data-source provenance from a deck's `description` so the app never
 * tells users where lists come from (product decision — sources stay on the
 * Events page only). Applied at feed-normalize time so it covers the live feed,
 * any cached feed, and future feeds regardless of the exact phrasing the
 * pipeline emits.
 *
 * The feed's description is always "<stat sentence>[ on <Source>]. Representative
 * <provenance>." — we keep the stat sentence (meta %, list/match counts) and
 * drop the trailing "Representative …" provenance sentence plus any "on <Source>"
 * clause. Idempotent: a description with no source text passes through unchanged.
 */

const SOURCE_NAMES = [
  "MTGGoldfish",
  "Untapped\\.gg",
  "MTGO",
  "Goldfish",
  "Scryfall",
  "Melee",
  "magic\\.gg",
];

const SOURCE_CLAUSE = new RegExp(`\\s+on (?:${SOURCE_NAMES.join("|")})\\b`, "gi");

export function sanitizeDeckDescription(description: string | undefined | null): string {
  if (!description) return "";
  let s = String(description);
  // Drop the trailing provenance sentence ("Representative … from …").
  s = s.replace(/\s*Representative\b[\s\S]*$/i, "");
  // Drop "on <Source>" attributions inside the remaining stat sentence.
  s = s.replace(SOURCE_CLAUSE, "");
  // Tidy spacing/punctuation left behind.
  s = s.replace(/\s{2,}/g, " ").replace(/\s+([.,)])/g, "$1").trim();
  if (s && !/[.!?]$/.test(s)) s += ".";
  return s;
}
