/**
 * Export the whole deck library to disk as Arena-importable text.
 *
 * WHY THIS EXISTS
 * Arena caps a collection at 100 decks, so players delete old lists to make
 * room and keep copies somewhere else — a deck site, or a folder of text files.
 * The lists are already in this app: the tracker pulls the registered 75 out of
 * `Player.log` for every match, in every constructed queue. Until now the only
 * way back out was the per-deck **Copy decklist** button, one deck at a time.
 *
 * TWO PROPERTIES THAT ARE THE POINT
 * 1. **No account.** These are the user's own lists off their own disk, so
 *    archiving them must never be behind sign-in (`AGENTS.md` cloud rule 1).
 * 2. **Every format.** Standard, Explorer, Historic, Alchemy, Timeless, Brawl —
 *    whatever the queue was. The app ships a metagame for two of those; that is
 *    a separate question from whether a deck is worth keeping.
 *
 * WHY THE TEXT IS BUILT HERE
 * Same reason publishing does it here: Arena card ids only become names via
 * Scryfall, and the Rust side has no id→name map. It renders the text, the
 * backend just writes bytes. See `arenaExport.ts`.
 *
 * ⚠️ BRAWL COMMANDERS ARE UNVERIFIED
 * Nothing in the chain reads a commander. The tracker takes `deckCards` and
 * `sideboardCards` off the GRE `connectResp.deckMessage` and nothing else
 * (`tracker.rs find_deck_message`), and `toArenaDecklist` passes
 * `commander: undefined` unconditionally — so a Brawl deck exports with no
 * `Commander` header even though `buildArenaImport` can write one.
 *
 * Whether that loses the card or merely untags it depends on where Arena puts
 * it in `deckMessage`, and there is **no Brawl log to check against** — none of
 * the fixtures in `src-tauri/tests/fixtures/logs/` is a Brawl match. So this is
 * recorded, not guessed at: inventing a field name would be exactly the fuzzy
 * matching the rest of this codebase refuses. Get a real Brawl `Player.log`,
 * add a fixture, then wire the commander through here and in `arenaExport.ts`.
 */

import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./appUpdater";
import { arenaFormatLabel } from "./arenaFormat";
import { resolveArenaCards } from "./arenaCards";
import { toArenaDecklist } from "./arenaExport";
import { latestDecklist, type RestoredList } from "./deckVersions";
import type { DeckGroup } from "./deckStats";

/** One deck as the Rust command wants it. */
export interface DeckExportEntry {
  name: string;
  /** Display label, or "" when Arena never named the queue. */
  format: string;
  /** Arena import text. */
  text: string;
}

export interface DeckLibraryExport {
  entries: DeckExportEntry[];
  /** Decks with no stored list anywhere — nothing to write. */
  missing: number;
  /** Decks held back because some card had no name yet. */
  unresolved: number;
}

/**
 * Turn a grouped deck library into files-to-be.
 *
 * `restored` fills in lists whose Arena log has since rotated away — the exact
 * gap cloud backup exists to close, and an archive that quietly dropped those
 * decks would be missing the oldest ones, which are the ones most worth having.
 *
 * A deck whose list cannot be fully named is **held back, not trimmed**.
 * `toArenaDecklist` drops rows it cannot name, so exporting anyway would write
 * a file that looks like a decklist and is quietly three cards short — worse
 * than no file. The count comes back so the caller can say so out loud; card
 * names resolve in the background, and a retry a minute later usually works.
 */
export async function buildDeckLibraryExport(
  decks: readonly DeckGroup[],
  restored?: ReadonlyMap<string, RestoredList> | null,
): Promise<DeckLibraryExport> {
  const picked: { deck: DeckGroup; main: number[]; side?: number[] }[] = [];
  let missing = 0;

  for (const deck of decks) {
    // A draft pool is not a deck you can rebuild — the cards are gone with the
    // event, so an "importable" file of them would list cards nobody owns.
    if (deck.format === "limited") continue;

    let list = latestDecklist(deck.matches);
    if (!list?.main.length && restored?.size) {
      for (const m of deck.matches) {
        const hit = m.deckHash ? restored.get(m.deckHash) : undefined;
        if (hit?.main.length) {
          list = { main: hit.main, side: hit.side };
          break;
        }
      }
    }
    if (!list?.main.length) {
      missing++;
      continue;
    }
    picked.push({ deck, main: list.main, side: list.side });
  }

  if (!picked.length) return { entries: [], missing, unresolved: 0 };

  // One resolve for the whole library rather than one per deck: the cache is
  // shared and a hundred decks overlap heavily on staples and lands.
  const ids = new Set<number>();
  for (const p of picked) {
    for (const id of p.main) ids.add(id);
    for (const id of p.side ?? []) ids.add(id);
  }
  const cards = await resolveArenaCards([...ids], { full: true });

  const entries: DeckExportEntry[] = [];
  let unresolved = 0;
  for (const p of picked) {
    const built = toArenaDecklist(p.main, p.side, cards);
    if (!built.text || built.unresolved > 0) {
      unresolved++;
      continue;
    }
    entries.push({
      name: p.deck.name,
      format: p.deck.format === "unknown" ? "" : arenaFormatLabel(p.deck.format),
      text: built.text,
    });
  }

  return { entries, missing, unresolved };
}

/** Write the built entries to a folder in Downloads; resolves to its path. */
export async function writeDeckLibrary(
  entries: readonly DeckExportEntry[],
): Promise<string> {
  if (!isTauri()) throw new Error("Exporting decklists needs the desktop app.");
  return invoke<string>("tracker_export_decklists", { decks: entries });
}

/**
 * What to tell the user after a run.
 *
 * Held-back decks are named in the message rather than left as a silent gap:
 * someone archiving before a rotation needs to know the archive is incomplete
 * while they can still do something about it.
 */
export function deckExportSummary(
  result: DeckLibraryExport,
  path: string,
): string {
  const n = result.entries.length;
  const parts = [`Saved ${n} deck${n === 1 ? "" : "s"} to ${path}`];
  if (result.unresolved > 0) {
    parts.push(
      `${result.unresolved} held back while card names load — try again in a minute`,
    );
  }
  if (result.missing > 0) {
    parts.push(
      `${result.missing} had no stored list (Arena's log rotated before we saw it)`,
    );
  }
  return parts.join(" · ");
}
