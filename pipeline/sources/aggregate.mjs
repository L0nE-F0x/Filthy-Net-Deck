/**
 * Merge authoritative lists from multiple sources onto the meta bundle.
 * Priority: magic.gg > mtgo > goldfish export > melee (if lists) > keep fallback tagged.
 */
import { applyListToDeck, fuzzyArchetype } from "./common.mjs";

const SOURCE_PRIORITY = {
  "magic.gg": 100,
  mtgo: 90,
  mtggoldfish: 80,
  melee: 70,
  untapped: 40,
};

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

/**
 * Assign free lists onto matching decks by archetype name + format.
 * Only overwrites if new source has higher priority OR current is fallback.
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
      // unused lists pool copy
      const available = [...pool];

      for (const id of ids) {
        const deck = bundle.decks[id];
        if (!deck) continue;

        const curPri =
          deck.listQuality === "authoritative"
            ? SOURCE_PRIORITY[deck.sources?.[0]?.name?.toLowerCase?.()] ||
              (deck.listNote?.includes("magic.gg")
                ? 100
                : deck.listNote?.includes("MTGO")
                  ? 90
                  : deck.listNote?.includes("Goldfish")
                    ? 80
                    : 50)
            : 0;

        // Best fuzzy match remaining list
        let best = null;
        let bestScore = 0;
        let bestIdx = -1;
        for (let i = 0; i < available.length; i++) {
          const L = available[i];
          // Prefer lists that still have cards
          if (!L.mainboard?.length) continue;
          // Name match if list has a name, else first-fit for standard fill
          const score = L.name
            ? fuzzyArchetype(deck.name, L.name) ||
              fuzzyArchetype(deck.archetype, L.name)
            : 0.3;
          const pri = SOURCE_PRIORITY[L.source] || 10;
          const combined = score * 10 + pri * 0.01;
          if (combined > bestScore) {
            bestScore = combined;
            best = L;
            bestIdx = i;
          }
        }

        if (!best) continue;
        const pri = SOURCE_PRIORITY[best.source] || 10;
        if (deck.listQuality === "authoritative" && pri <= curPri && bestScore < 0.85)
          continue;
        if (bestScore < 0.35 && best.name) continue; // weak match with named list

        if (
          applyListToDeck(deck, best, {
            source: best.source,
            sourceLabel: best.sourceLabel || best.source,
            url: best.url,
            note: best.note,
          })
        ) {
          applied++;
          // consume list so we don't duplicate same 60 on every deck
          available.splice(bestIdx, 1);
        }
      }

      // Second pass: fill remaining fallback decks with any leftover lists (first-fit)
      for (const id of ids) {
        const deck = bundle.decks[id];
        if (!deck || deck.listQuality === "authoritative") continue;
        const next = available.shift();
        if (!next) break;
        if (
          applyListToDeck(deck, next, {
            source: next.source,
            sourceLabel: next.sourceLabel || next.source,
            url: next.url,
            note: `${next.note || next.source} · assigned by rank order`,
          })
        ) {
          applied++;
        }
      }
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
