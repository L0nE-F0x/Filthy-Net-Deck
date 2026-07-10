/**
 * Merge authoritative lists from multiple sources onto the meta bundle.
 * Priority: mtgo > goldfish export > magic.gg > melee > fallback.
 */
import { applyListToDeck, fuzzyArchetype } from "./common.mjs";
import {
  colorCompatibility,
  inferColorsFromCards,
  listFitsArchetype,
} from "./archetypeGuess.mjs";

const SOURCE_PRIORITY = {
  mtgo: 100,
  mtggoldfish: 90,
  "magic.gg": 70,
  melee: 60,
  untapped: 40,
};

/** Reject lists whose card names look like concatenated multi-card garbage. */
export function isSaneList(list) {
  if (!list?.mainboard?.length) return false;
  const n = list.mainboard.reduce((s, c) => s + (c.count || 0), 0);
  if (n < 50 || n > 110) return false;
  for (const c of list.mainboard) {
    const name = String(c.name || "").trim();
    if (!name || name.length < 2) return false;
    if (name.length > 45) return false;
    if (/\s\d{1,2}\s+[A-Z]/.test(name)) return false;
    if ((name.match(/\s/g) || []).length > 7) return false;
  }
  return true;
}

export function mergeTournamentFeeds(bundle, feeds) {
  const existing = new Set((bundle.tournaments || []).map((t) => t.id));
  const merged = [...(bundle.tournaments || [])];
  for (const feed of feeds) {
    for (const t of feed.tournaments || []) {
      if (!t?.id || !t?.url) continue;
      if (existing.has(t.id)) continue;
      existing.add(t.id);
      merged.push(t);
    }
  }
  bundle.tournaments = merged.slice(0, 40);
  return bundle;
}

function nameScore(deck, list) {
  if (!list.name) return 0;
  // Ignore weak generic MTGO placeholders
  if (/^mtgo deck/i.test(list.name)) return 0;
  return Math.max(
    fuzzyArchetype(deck.name, list.name),
    fuzzyArchetype(deck.archetype || "", list.name),
  );
}

/**
 * Assign free lists onto matching decks by archetype name + format + colors.
 * Never overwrites a good seed with a poorly matched "authoritative" list.
 */
export function assignListsToBundle(bundle, lists) {
  let applied = 0;
  const byFormat = {};
  for (const list of lists) {
    const f = list.format || "standard";
    if (!byFormat[f]) byFormat[f] = [];
    byFormat[f].push(list);
  }

  for (const fmt of bundle.formats) {
    const pool = byFormat[fmt.id] || [];
    if (!pool.length) continue;

    for (const modeKey of ["bo1DeckIds", "bo3DeckIds"]) {
      const ids = fmt[modeKey] || [];
      const available = [...pool];

      for (const id of ids) {
        const deck = bundle.decks[id];
        if (!deck) continue;

        const curPri =
          deck.listQuality === "authoritative"
            ? SOURCE_PRIORITY[deck.sources?.[0]?.name?.toLowerCase?.()] ||
              (deck.listNote?.includes("MTGO")
                ? 100
                : deck.listNote?.includes("Goldfish")
                  ? 90
                  : deck.listNote?.includes("magic.gg")
                    ? 70
                    : 50)
            : 0;

        let best = null;
        let bestScore = 0;
        let bestIdx = -1;

        for (let i = 0; i < available.length; i++) {
          const L = available[i];
          if (!isSaneList(L)) continue;

          const nScore = nameScore(deck, L);
          const listColors =
            L.colors || inferColorsFromCards(L.mainboard || []);
          const cScore = colorCompatibility(deck.colors || [], listColors);
          const fit = listFitsArchetype(
            deck.archetype || deck.name,
            L.mainboard || [],
          );

          // Hard reject color mismatch (e.g. UB Dimir on 4c Control)
          if (cScore < 0.4) continue;
          // Hard reject archetype poison (e.g. Mardu TMNT aggro labeled 4c Control)
          if (fit < 0.5) continue;
          // Require real name match for named lists
          if (L.name && nScore < 0.55) continue;
          // Unnamed lists only if colors fit well AND archetype fit is solid
          if (!L.name && (cScore < 0.7 || fit < 0.55)) continue;

          const pri = SOURCE_PRIORITY[L.source] || 10;
          // Name dominates; fit + colors break ties; source is a light boost
          const combined = nScore * 10 + fit * 4 + cScore * 3 + pri * 0.01;
          if (combined > bestScore) {
            bestScore = combined;
            best = L;
            bestIdx = i;
          }
        }

        if (!best) continue;
        const pri = SOURCE_PRIORITY[best.source] || 10;
        // Never downgrade source priority (e.g. magic.gg must not overwrite Goldfish/MTGO)
        if (deck.listQuality === "authoritative" && pri < curPri) continue;
        // Equal priority needs a clearly stronger combined match
        if (
          deck.listQuality === "authoritative" &&
          pri === curPri &&
          bestScore < 8
        )
          continue;

        if (
          applyListToDeck(deck, best, {
            source: best.source,
            sourceLabel: best.sourceLabel || best.source,
            url: best.url,
            note: best.note,
          })
        ) {
          applied++;
          available.splice(bestIdx, 1);
        }
      }
      // No anonymous first-fit pass — better to keep seed than wrong 60.
    }
  }

  return applied;
}

export function mergeSourceTags(bundle, tags) {
  const set = new Set(bundle.sources || []);
  for (const t of tags) set.add(t);
  for (const bad of ["seed", "spicerack"]) set.delete(bad);
  bundle.sources = [...set];
  return bundle;
}

/**
 * Final QA: strip "authoritative" from decks whose mainboard fails archetype fit.
 * Call after all list assignment. Optionally restore from seedDeck if provided.
 */
export function scrubMisfitAuthoritative(bundle, seedBundle = null) {
  let scrubbed = 0;
  for (const [id, deck] of Object.entries(bundle.decks || {})) {
    if (!deck?.mainboard?.length) continue;
    const fit = listFitsArchetype(deck.archetype || deck.name, deck.mainboard);
    if (fit >= 0.5) continue;
    // Only hard-scrub clear poison / control-aggro mismatches
    if (fit > 0.25 && deck.listQuality !== "authoritative") continue;
    if (fit > 0.25) continue; // soft unknowns keep their list; assignment already gated

    const seedDeck = seedBundle?.decks?.[id];
    if (seedDeck?.mainboard?.length) {
      deck.mainboard = seedDeck.mainboard;
      deck.sideboard = seedDeck.sideboard || [];
      deck.arenaImport = seedDeck.arenaImport;
      deck.listQuality = "fallback";
      deck.listNote =
        "Restored offline pack — live list failed archetype fit QA";
      scrubbed++;
      console.log(`  QA scrub: ${id} fit=${fit.toFixed(2)} → seed`);
    } else if (deck.listQuality === "authoritative") {
      deck.listQuality = "partial";
      deck.listNote = `${deck.listNote || ""} · archetype fit QA warning`.trim();
      scrubbed++;
    }
  }
  return scrubbed;
}
