/**
 * Decklist → Arena import text.
 *
 * The inverse of `arenaImport.ts`. What comes out here is exactly what Arena's
 * **Import** button accepts, so a viewer can copy a published deck off a
 * profile page and be playing it in two clicks — which is the whole reason
 * published decks carry a list at all.
 *
 * FORMAT
 * Plain `<qty> <Name>` lines under `Deck` / `Sideboard` headers. Deliberately
 * no `(SET) 123` suffix: `ArenaCardInfo` carries no set code or collector
 * number (see `arenaCards.ts`), and Arena resolves a bare name to a legal
 * printing on its own. A wrong set suffix would be worse than none.
 *
 * Names go through `arenaCardName`, so an MDFC/adventure/room arrives as its
 * front face. Scryfall hands back "Unholy Annex // Ritual Chamber" and Arena's
 * importer rejects that outright — without the strip, publishing any Standard
 * deck with a modal land would produce a list nobody could import.
 *
 * WHY THE TEXT IS BUILT HERE AND UPLOADED
 * The server has no arena-id → name map, so it cannot render a list from the
 * stored ids. The app can — it resolved those names to draw the deck screen.
 * So publishing sends the finished text. See migration 20260820120000.
 */

import type { CardEntry } from "../types/meta";
import type { ArenaCardInfo } from "./arenaCards";
import { buildArenaImport } from "./arenaImport";
import { aggregateDeck } from "./deckShare";

export interface ArenaExportResult {
  /** Arena-importable text, or "" when the list could not be rendered. */
  text: string;
  /** Distinct ids with no resolved name. Non-zero means do not publish. */
  unresolved: number;
  /** Total mainboard copies. */
  main: number;
  /** Total sideboard copies. */
  side: number;
}

/** Ids → `[id, qty]` in first-seen order, so a list reads the way it was registered. */
function tally(ids: readonly number[] | undefined): [number, number][] {
  const qty = new Map<number, number>();
  for (const id of ids ?? []) {
    if (!Number.isFinite(id)) continue;
    qty.set(id, (qty.get(id) ?? 0) + 1);
  }
  return [...qty.entries()];
}

/**
 * Render `main`/`side` arena ids as Arena import text.
 *
 * ORDER
 * The mainboard is grouped **creatures, then other spells, then lands**, each
 * group by mana value then name. That is `aggregateDeck`'s ordering, reused
 * rather than reimplemented so a published list reads in the same order as the
 * deck's share card and the in-app deck screen — three surfaces showing one
 * deck should not disagree about what order it is in.
 *
 * Sorting the whole list by mana value alone put the lands *first* (they are
 * MV 0), which is the opposite of how every decklist is written.
 *
 * The order is deterministic, so re-publishing an unchanged deck rewrites
 * byte-identical text rather than churning the stored list.
 *
 * The sideboard is tallied here instead: `aggregateDeck` returns it as a count,
 * not rows, and a sideboard is conventionally a flat list anyway.
 *
 * `unresolved` is reported rather than papered over: a line reading
 * `4 Card 103529` is useless to whoever copies it, so the caller refuses to
 * publish instead of shipping a broken list.
 */
export function toArenaDecklist(
  mainIds: readonly number[] | undefined,
  sideIds: readonly number[] | undefined,
  cards: Record<number, ArenaCardInfo>,
): ArenaExportResult {
  const agg = aggregateDeck(mainIds, sideIds, cards);

  const mainboard: CardEntry[] = [];
  for (const group of agg.groups) {
    for (const row of group.rows) {
      // A row with no resolved name renders as "Card 103529"; count it and drop
      // it, so the caller can refuse rather than publish an unimportable line.
      if (row.unresolved) continue;
      mainboard.push({ name: row.name, count: row.qty });
    }
  }

  let side = 0;
  let sideUnresolved = 0;
  const sideboard = tally(sideIds)
    .map(([id, count]) => {
      const info = cards[id];
      const name = info?.name?.trim();
      if (!name) sideUnresolved++;
      side += count;
      return {
        name: name ?? "",
        count,
        cmc: typeof info?.cmc === "number" ? info.cmc : Number.POSITIVE_INFINITY,
      };
    })
    .sort((a, b) => (a.cmc !== b.cmc ? a.cmc - b.cmc : a.name.localeCompare(b.name)))
    .filter((r) => r.name);

  const unresolved = agg.unresolved + sideUnresolved;
  if (!mainboard.length) return { text: "", unresolved, main: agg.total, side };

  // `buildArenaImport` owns the header layout and the front-face name strip, so
  // a published list and an in-app "copy deck" produce byte-identical text.
  return {
    text: buildArenaImport({ mainboard, sideboard, commander: undefined }),
    unresolved,
    main: agg.total,
    side,
  };
}

/**
 * URL slug for a deck name.
 *
 * Kept in sync with `public.deck_slugify()` in migration 20260820120000 — the
 * database assigns the real slug, this is what the app predicts so it can show
 * the link. A mismatch means the app offers a URL the site does not serve.
 */
export function deckSlug(name: string): string {
  const s = String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/^-+|-+$/g, "");
  return s || "deck";
}
