/**
 * Pure Sets Radar date / countdown / card-filter helpers (peeled from Sets.tsx).
 */

import type { DateConfidence, SetPreviewCard, SetStatus } from "../types/sets";

export type TypeFilter =
  | "all"
  | "creature"
  | "instant"
  | "sorcery"
  | "enchantment"
  | "artifact"
  | "planeswalker"
  | "land"
  | "other";

export function statusLabel(s: SetStatus): string {
  switch (s) {
    case "spoiling":
      return "Spoilers live";
    case "announced":
      return "Announced";
    case "live_on_arena":
      return "On Arena";
    case "released":
      return "Released";
    default:
      return s;
  }
}

export function statusClass(s: SetStatus): string {
  return `set-status set-status-${s}`;
}

/** Human calendar label for a YYYY-MM-DD (or TBA). */
export function formatSetDate(iso: string | null | undefined): string {
  if (!iso) return "TBA";
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/**
 * Whole local days from local noon today to the given ISO date at noon.
 * Positive = future, negative = past, null if missing/invalid.
 */
export function daysUntil(
  iso: string | null | undefined,
  nowMs = Date.now(),
): number | null {
  if (!iso) return null;
  const t = new Date(`${iso}T12:00:00`).getTime();
  if (!Number.isFinite(t)) return null;
  const now = new Date(nowMs);
  now.setHours(12, 0, 0, 0);
  return Math.round((t - now.getTime()) / 86400000);
}

export function countdownLabel(
  iso: string | null | undefined,
  nowMs = Date.now(),
): string {
  const d = daysUntil(iso, nowMs);
  if (d == null) return "TBA";
  if (d < 0) return `${Math.abs(d)}d ago`;
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  return `${d}d`;
}

export function confidenceHint(c: DateConfidence | undefined): string {
  if (c === "estimated") return "est.";
  if (c === "official" || c === "override") return "official";
  return "";
}

/** Arena drop within ±1 calendar day of today. */
export function isArenaDropWindow(
  iso: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  const d = daysUntil(iso, nowMs);
  return d != null && d >= -1 && d <= 1;
}

export function rarityClass(r: string): string {
  const x = r.toLowerCase();
  if (x === "mythic") return "rarity-mythic";
  if (x === "rare") return "rarity-rare";
  if (x === "uncommon") return "rarity-uncommon";
  if (x === "common") return "rarity-common";
  return "rarity-special";
}

export const RARITY_RANK: Record<string, number> = {
  mythic: 0,
  rare: 1,
  uncommon: 2,
  common: 3,
};

export function typeBucket(typeLine: string | undefined): TypeFilter {
  const t = (typeLine || "").toLowerCase();
  if (t.includes("creature")) return "creature";
  if (t.includes("planeswalker")) return "planeswalker";
  if (t.includes("instant")) return "instant";
  if (t.includes("sorcery")) return "sorcery";
  if (t.includes("enchantment")) return "enchantment";
  if (t.includes("artifact")) return "artifact";
  if (t.includes("land")) return "land";
  return "other";
}

export function cardIsColorless(c: Pick<SetPreviewCard, "colors">): boolean {
  return !c.colors?.length;
}

export function cardHasColor(
  c: Pick<SetPreviewCard, "colors">,
  col: string,
): boolean {
  if (col === "C") return cardIsColorless(c);
  return (c.colors || []).includes(col);
}
