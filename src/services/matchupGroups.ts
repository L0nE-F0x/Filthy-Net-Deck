/**
 * Matchup Lab opponent grouping/sorting (peeled from Matchups.tsx).
 */

import type { TrackedMatch } from "../types/tracker";
import { recentFormString } from "./gameAnalytics";
import { opponentKey } from "./matchupNotes";

export interface OppGroup {
  key: string;
  name: string;
  matches: TrackedMatch[];
  wins: number;
  losses: number;
  rate: number | null;
  lastAt: number;
  decks: string[];
  /** Last up to 5 decided results oldest→newest (W/L). */
  form: string;
  tag?: string;
  notes?: string;
}

export type OppSortKey = "recent" | "matches" | "rate" | "losses" | "name";

export function groupOpponents(
  matches: TrackedMatch[],
  notes: Record<string, { tag?: string; notes?: string } | undefined>,
): OppGroup[] {
  const by = new Map<string, TrackedMatch[]>();
  for (const m of matches) {
    const k = opponentKey(m.opponentName);
    let list = by.get(k);
    if (!list) {
      list = [];
      by.set(k, list);
    }
    list.push(m);
  }
  const out: OppGroup[] = [];
  for (const [key, list] of by) {
    const wins = list.filter((m) => m.result === "win").length;
    const losses = list.filter((m) => m.result === "loss").length;
    const decided = wins + losses;
    const decks = [
      ...new Set(list.map((m) => m.deckName).filter((n): n is string => Boolean(n))),
    ];
    const note = notes[key];
    const name =
      list.find((m) => m.opponentName)?.opponentName?.trim() ||
      (key === "unknown" ? "Unknown" : key);
    out.push({
      key,
      name,
      matches: list,
      wins,
      losses,
      rate: decided > 0 ? wins / decided : null,
      lastAt: Math.max(...list.map((m) => m.endedAt)),
      decks,
      form: recentFormString(list, 5),
      tag: note?.tag,
      notes: note?.notes,
    });
  }
  return out;
}

export function sortOppGroups(groups: OppGroup[], key: OppSortKey): OppGroup[] {
  return [...groups].sort((a, b) => {
    if (key === "recent") return b.lastAt - a.lastAt;
    if (key === "matches") return b.matches.length - a.matches.length || b.lastAt - a.lastAt;
    if (key === "losses") return b.losses - a.losses || b.matches.length - a.matches.length;
    if (key === "rate") {
      if (a.rate == null && b.rate == null) return b.matches.length - a.matches.length;
      if (a.rate == null) return 1;
      if (b.rate == null) return -1;
      return a.rate - b.rate || b.matches.length - a.matches.length; // worst first
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}
