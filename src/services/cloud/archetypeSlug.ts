/**
 * Canonical archetype slugs — the join key for crowd data.
 *
 * Everything aggregated server-side is keyed on these, so two players calling
 * the same deck "Azorius Control" and "azorius control" must produce one slug
 * or the matchup cell silently splits in half. Format is included because the
 * same archetype name means different decks in Standard and Pioneer.
 *
 * Deliberately conservative: no fuzzy matching, no stemming. A name that does
 * not normalise cleanly is better dropped than merged into the wrong bucket —
 * same rule the meta pipeline already follows for decklists.
 */

import type { FormatId } from "../../types/meta";

/**
 * Combining marks left behind by NFKD.
 *
 * `\p{M}` rather than a `̀-ͯ` range: the source stays pure ASCII (a
 * literal range is invisible in diffs and does not survive tooling that assumes
 * a non-UTF-8 codepage), and it covers marks outside the Latin block that the
 * range silently misses.
 */
const COMBINING_MARKS = /\p{M}/gu;

/** `standard-azorius-control`. Returns null for anything unusable. */
export function archetypeSlug(
  formatId: FormatId | string | null | undefined,
  name: string | null | undefined,
): string | null {
  const fmt = String(formatId ?? "")
    .trim()
    .toLowerCase();
  if (fmt !== "standard" && fmt !== "pioneer") return null;

  const base = String(name ?? "")
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!base) return null;
  const slug = `${fmt}-${base}`;
  // Must satisfy the server's check constraint, or the insert is rejected.
  return /^[a-z0-9-]{1,80}$/.test(slug) ? slug : null;
}

/** Human label back out of a slug, for display when the registry lacks a name. */
export function labelFromSlug(slug: string): string {
  const parts = slug.split("-");
  if (parts.length > 1 && (parts[0] === "standard" || parts[0] === "pioneer")) {
    parts.shift();
  }
  return parts
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
