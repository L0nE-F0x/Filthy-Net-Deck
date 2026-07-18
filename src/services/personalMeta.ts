/**
 * Personal winrate vs meta share — pure join of tracker matches + live meta decks.
 */

import type { Deck } from "../types/meta";
import type { TrackedMatch } from "../types/tracker";
import { deckKey } from "./tracker";

export interface PersonalMetaRow {
  archetype: string;
  metaShare: number;
  metaRank: number;
  yourWins: number;
  yourLosses: number;
  yourGames: number;
  yourWinrate: number | null;
  /** Your WR minus a neutral 0.5 baseline, or null without sample. */
  edge: number | null;
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * For each ranked meta deck, attach the pilot's record when their local deck
 * name (or hash group name) fuzzy-matches the archetype.
 */
export function personalVsMeta(
  matches: TrackedMatch[],
  rankedDecks: Deck[],
  opts?: { minGames?: number },
): PersonalMetaRow[] {
  const minGames = opts?.minGames ?? 0;

  // Aggregate personal record by deck display name
  const byName = new Map<string, { wins: number; losses: number; label: string }>();
  for (const m of matches) {
    if (m.result !== "win" && m.result !== "loss") continue;
    const label = m.deckName?.trim() || deckKey(m);
    const key = normalizeName(label);
    const row = byName.get(key) ?? { wins: 0, losses: 0, label };
    if (m.result === "win") row.wins++;
    else row.losses++;
    if (m.deckName?.trim()) row.label = m.deckName.trim();
    byName.set(key, row);
  }

  const rows: PersonalMetaRow[] = rankedDecks.map((d, idx) => {
    const arch = d.archetype || d.name;
    const key = normalizeName(arch);
    // Prefer exact name match; else substring in either direction. Among
    // substring candidates the longest key wins (most specific), so a generic
    // name like "control" can't steal "Azorius Control v2"'s record.
    // Alphabetical tie-break keeps the choice deterministic.
    let you = byName.get(key);
    if (!you) {
      let best: string | null = null;
      for (const k of byName.keys()) {
        if (!k.includes(key) && !key.includes(k)) continue;
        if (best === null || k.length > best.length || (k.length === best.length && k < best)) {
          best = k;
        }
      }
      if (best !== null) you = byName.get(best);
    }
    const yourWins = you?.wins ?? 0;
    const yourLosses = you?.losses ?? 0;
    const yourGames = yourWins + yourLosses;
    const yourWinrate = yourGames ? yourWins / yourGames : null;
    return {
      archetype: arch,
      metaShare: d.metaShare ?? 0,
      metaRank: d.rank ?? idx + 1,
      yourWins,
      yourLosses,
      yourGames,
      yourWinrate,
      edge: yourWinrate == null ? null : yourWinrate - 0.5,
    };
  });

  return rows.filter((r) => r.yourGames >= minGames || minGames === 0);
}

/** Best personal performer among decks you actually played. */
export function bestPersonalArchetype(
  rows: PersonalMetaRow[],
  minGames = 3,
): PersonalMetaRow | null {
  const played = rows
    .filter((r) => r.yourGames >= minGames && r.yourWinrate != null)
    .sort(
      (a, b) =>
        (b.yourWinrate ?? 0) - (a.yourWinrate ?? 0) || b.yourGames - a.yourGames,
    );
  return played[0] ?? null;
}
