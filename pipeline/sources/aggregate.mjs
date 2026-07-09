/**
 * Merge authoritative lists from multiple sources onto the meta bundle.
 * Priority: magic.gg > mtgo > goldfish export > melee (if lists) > keep fallback tagged.
 */
import { applyListToDeck, fuzzyArchetype } from "./common.mjs";

// MTGO embedded JSON is the most reliable full-list source.
// magic.gg HTML parsing is secondary (can mis-split card names).
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
    // Parser bug: "Thornspire Verge 4 Stomping Ground 4 Forest…"
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
          if (!isSaneList(L)) continue;
          // Name match if list has a name, else weak first-fit
          const score = L.name
            ? Math.max(
                fuzzyArchetype(deck.name, L.name),
                fuzzyArchetype(deck.archetype || "", L.name),
              )
            : 0.25;
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
        // Require a real name match — never slap random MTGO lists onto wrong shells
        if (best.name && bestScore < 0.45) continue;

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

      // Second pass: only assign leftover lists with no archetype name (anonymous blocks)
      for (const id of ids) {
        const deck = bundle.decks[id];
        if (!deck || deck.listQuality === "authoritative") continue;
        let nextIdx = available.findIndex((L) => isSaneList(L) && !L.name);
        if (nextIdx < 0) break;
        const next = available.splice(nextIdx, 1)[0];
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
