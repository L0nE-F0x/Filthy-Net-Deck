/**
 * Pure card-list / archetype diffs for the daily "what changed" view.
 * Driven with fixture meta decks — no I/O.
 */

export interface CountedCard {
  name: string;
  count: number;
}

export interface CardSwap {
  name: string;
  /** Count in the older list (0 if newly added). */
  from: number;
  /** Count in the newer list (0 if fully cut). */
  to: number;
}

export interface ListDiff {
  added: CardSwap[];
  removed: CardSwap[];
  changed: CardSwap[];
  /** True when both lists are identical (same names + counts). */
  identical: boolean;
}

function normalize(cards: CountedCard[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of cards) {
    const name = String(c.name || "").trim();
    if (!name) continue;
    const n = Number(c.count) || 0;
    if (n <= 0) continue;
    m.set(name, (m.get(name) ?? 0) + n);
  }
  return m;
}

/** Diff two mainboards (or sideboards) by card name. */
export function diffCardLists(
  previous: CountedCard[],
  current: CountedCard[],
): ListDiff {
  const prev = normalize(previous);
  const next = normalize(current);
  const added: CardSwap[] = [];
  const removed: CardSwap[] = [];
  const changed: CardSwap[] = [];

  const names = new Set([...prev.keys(), ...next.keys()]);
  for (const name of [...names].sort((a, b) => a.localeCompare(b))) {
    const from = prev.get(name) ?? 0;
    const to = next.get(name) ?? 0;
    if (from === to) continue;
    const row = { name, from, to };
    if (from === 0) added.push(row);
    else if (to === 0) removed.push(row);
    else changed.push(row);
  }

  return {
    added,
    removed,
    changed,
    identical: added.length === 0 && removed.length === 0 && changed.length === 0,
  };
}

/**
 * Rank-aware archetype movement between two ordered name lists
 * (e.g. goldfish metagame board for a format+mode).
 */
export interface ArchetypeMove {
  name: string;
  kind: "rose" | "fell" | "entered" | "left" | "same";
  fromRank: number | null;
  toRank: number | null;
}

export function diffArchetypeRanks(
  previousNames: string[],
  currentNames: string[],
): ArchetypeMove[] {
  const prev = previousNames.map((n) => n.trim()).filter(Boolean);
  const next = currentNames.map((n) => n.trim()).filter(Boolean);
  const prevIdx = new Map(prev.map((n, i) => [n, i]));
  const nextIdx = new Map(next.map((n, i) => [n, i]));
  const names = new Set([...prev, ...next]);
  const out: ArchetypeMove[] = [];

  for (const name of names) {
    const fromRank = prevIdx.has(name) ? (prevIdx.get(name) as number) + 1 : null;
    const toRank = nextIdx.has(name) ? (nextIdx.get(name) as number) + 1 : null;
    let kind: ArchetypeMove["kind"] = "same";
    if (fromRank == null && toRank != null) kind = "entered";
    else if (fromRank != null && toRank == null) kind = "left";
    else if (fromRank != null && toRank != null) {
      if (toRank < fromRank) kind = "rose";
      else if (toRank > fromRank) kind = "fell";
      else kind = "same";
    }
    out.push({ name, kind, fromRank, toRank });
  }

  const order: Record<ArchetypeMove["kind"], number> = {
    entered: 0,
    rose: 1,
    fell: 2,
    left: 3,
    same: 4,
  };
  return out.sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name));
}

/** Find a deck in a dated bundle snapshot by format + mode + archetype name. */
export function findDeckList(
  decks: Record<string, { name?: string; format?: string; mode?: string; mainboard?: CountedCard[] }>,
  formatId: string,
  mode: string,
  archetypeName: string,
): CountedCard[] | null {
  const target = archetypeName.trim().toLowerCase();
  for (const d of Object.values(decks || {})) {
    if (
      d.format === formatId &&
      d.mode === mode &&
      String(d.name || "").trim().toLowerCase() === target
    ) {
      return (d.mainboard || []).map((c) => ({
        name: c.name,
        count: c.count,
      }));
    }
  }
  return null;
}
