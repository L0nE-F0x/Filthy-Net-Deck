/**
 * Arena queue id → the format that queue actually is.
 *
 * WHY THIS EXISTS SEPARATELY FROM `deckHelpers.formatIdForEvent`
 * That function answers a *meta bundle* question — "which of the formats this
 * app covers should I show for this queue?" — and returns null for everything
 * else so callers fall back to the featured format. Perfectly correct for
 * picking a tier list.
 *
 * It is the wrong question for a decklist. A deck the user built in Historic
 * is a Historic deck whether or not the app ships a Historic metagame, and the
 * old cloud-side resolver got that wrong in a way that mattered:
 *
 *     if (id.includes("standard") || id.includes("ladder")) return "standard";
 *
 * `Historic_Ladder` contains "ladder". So did `Alchemy_Ladder` and
 * `Timeless_Ladder`, and `Brawl` fell through to the featured format — every
 * one of them uploaded as **Standard**. That put non-Standard matches into the
 * crowd matchup rollup and stamped "standard" on Historic decks published to
 * `/u/<handle>/<slug>`.
 *
 * So: this module names the queue honestly, and each consumer decides what it
 * is allowed to do with the answer.
 *
 * ORDER IS LOAD-BEARING. `Historic_Brawl` contains "historic"; `Historic_Ladder`
 * contains "ladder". The specific prefixes are claimed before the bare queue
 * names, and Standard is what is left over rather than what is guessed.
 */

import type { FormatId } from "../types/meta";

/**
 * Every format the tracker can see in a queue id.
 *
 * `unknown` is a real answer, not a failure: Arena does not always hand over an
 * event id, and "we don't know" beats defaulting to Standard — that default is
 * exactly what this module exists to undo.
 */
export type ArenaFormat =
  | "standard"
  | "pioneer"
  | "historic"
  | "alchemy"
  | "timeless"
  | "brawl"
  | "limited"
  | "unknown";

/**
 * Formats whose decks are worth archiving: constructed lists the user built and
 * could rebuild. Limited is excluded on purpose — a draft deck is a sealed pool
 * that no longer exists, so an Arena import of it would be a list of cards the
 * user does not own.
 */
export const ARCHIVABLE_FORMATS = [
  "standard",
  "pioneer",
  "historic",
  "alchemy",
  "timeless",
  "brawl",
] as const;

export type ArchivableFormat = (typeof ARCHIVABLE_FORMATS)[number];

const ARCHIVABLE = new Set<string>(ARCHIVABLE_FORMATS);

/** True for a format whose decks belong in the deck library and its backup. */
export function isArchivableFormat(
  f: ArenaFormat | string | null | undefined,
): f is ArchivableFormat {
  return ARCHIVABLE.has(String(f ?? "").toLowerCase());
}

/**
 * What format a queue is.
 *
 * Explorer maps to `pioneer` — near-identical card pool, and it is the
 * convention the meta feed and `formatIdForEvent` already use, so one deck does
 * not end up filed under two names depending on which code path saw it.
 */
export function arenaFormatOf(eventId: string | null | undefined): ArenaFormat {
  const raw = String(eventId ?? "").trim();
  if (!raw || /^unknown$/i.test(raw)) return "unknown";
  const id = raw.toLowerCase();

  // Brawl first: "Historic_Brawl" is Brawl, not Historic.
  if (id.includes("brawl")) return "brawl";
  // Limited before anything else that could match a set-code suffix.
  if (/draft|sealed/.test(id)) return "limited";
  if (id.includes("timeless")) return "timeless";
  if (id.includes("alchemy")) return "alchemy";
  if (id.includes("historic")) return "historic";
  if (/pioneer|explorer/.test(id)) return "pioneer";
  // Standard is the leftover, not a guess: the prefixed queues are all claimed
  // above, so a surviving bare "Ladder" / "Play" is Standard's own.
  if (id.includes("standard")) return "standard";
  if (/(^|_)(ladder|play)(_|$)/.test(id)) return "standard";

  return "unknown";
}

/** Display label for a format, e.g. for a chip on a deck row. */
export function arenaFormatLabel(f: ArenaFormat): string {
  switch (f) {
    case "standard":
      return "Standard";
    case "pioneer":
      return "Explorer";
    case "historic":
      return "Historic";
    case "alchemy":
      return "Alchemy";
    case "timeless":
      return "Timeless";
    case "brawl":
      return "Brawl";
    case "limited":
      return "Limited";
    default:
      return "Unknown";
  }
}

/**
 * The bundle format for a queue, or null when the app ships no metagame for it.
 *
 * This is the gate for anything that joins against crowd data or a tier list —
 * `Formats: Standard + Pioneer only` is a product constraint, and a Historic
 * match must never be counted in a Standard matchup cell.
 */
export function metaFormatOf(
  eventId: string | null | undefined,
): FormatId | null {
  const f = arenaFormatOf(eventId);
  return f === "standard" || f === "pioneer" ? (f as FormatId) : null;
}

/**
 * The format to count a match under on a **local** page — your own matchup
 * records, the Daily chips, a deck page's "your record", the overlay's guess.
 *
 * Three-way, and the middle case is the whole point:
 *
 * | queue                        | answer     | why |
 * |------------------------------|------------|-----|
 * | Standard / Explorer          | itself     | covered, joinable |
 * | Historic, Brawl, draft, …    | **null**   | *known* not to be Standard |
 * | Arena never named it         | `fallback` | unknown ≠ known-wrong |
 *
 * The old code collapsed rows two and three into `?? "standard"`, which is how
 * a Historic game ended up in the Standard matchup table and how the overlay
 * came to name a Standard archetype during a Historic match. Being told the
 * wrong archetype is worse than being told none.
 *
 * Row three keeps its fallback because "we never saw a queue id" is a genuinely
 * different state from "we saw one and it was Brawl", and the page the user is
 * looking at is the best available prior for it. Note this is **weaker** than
 * the upload rule: `metaFormatOf` rejects unnamed queues outright, because a
 * wrong row in the crowd rollup is everyone's problem while a wrong row in your
 * own local record is only ever yours — and it is recoverable by looking at the
 * match list. Local pages may lean on context; uploads may not.
 */
export function localFormatOf(
  eventId: string | null | undefined,
  fallback: FormatId | null | undefined,
): FormatId | null {
  const f = arenaFormatOf(eventId);
  if (f === "standard" || f === "pioneer") return f as FormatId;
  if (f !== "unknown") return null;
  return fallback ?? null;
}

/**
 * True when a match is from a format the app covers nothing for, so a page
 * scoped to Standard/Pioneer must leave it out.
 *
 * Counts only queues Arena actually named — an unnamed one is not evidence of
 * anything, and calling it "excluded" in the UI would be a claim we cannot back.
 */
export function isUncoveredFormat(eventId: string | null | undefined): boolean {
  const f = arenaFormatOf(eventId);
  return f !== "standard" && f !== "pioneer" && f !== "unknown";
}
