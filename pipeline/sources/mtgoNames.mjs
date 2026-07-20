/**
 * MTGO → Scryfall card-name normalizer.
 *
 * MTGO decklist JSON names Universes Beyond dual-identity cards by their
 * PRINTED alias (e.g. "Desecrex, Gift of Servitude"), while Scryfall's
 * /cards/collection validation wants the canonical name ("Carnage, Crimson
 * Chaos"). Without this map those cards fail validation and get dropped —
 * the 2026-07-20 Mardu Discard list shipped 58/60 exactly this way.
 *
 * The map is GENERATED from Scryfall by scripts/gen-mtgo-name-map.mjs
 * (alias printings where printed_name ≠ name), so every entry is verified
 * by construction. Unknown names pass through unchanged and still drop with
 * a diagnostic downstream — nothing is ever invented here.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const mapPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "mtgo-name-map.json",
);

/** @type {Record<string, string>} */
export const MTGO_NAME_MAP = JSON.parse(readFileSync(mapPath, "utf8")).names;

/** Canonical Scryfall name for an MTGO card name (pass-through when unknown). */
export function normalizeMtgoCardName(name) {
  const key = String(name).trim();
  return MTGO_NAME_MAP[key] ?? key;
}
