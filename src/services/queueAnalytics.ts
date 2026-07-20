/**
 * Queue-level personal WR (Ladder vs Traditional, etc.) — pure, local.
 */

import type { TrackedMatch } from "../types/tracker";
import { queueLabel } from "./tracker";

export interface QueueSplitRow {
  /** Raw Arena eventId. */
  eventId: string;
  /** Human label. */
  label: string;
  wins: number;
  losses: number;
  games: number;
  rate: number | null;
  /** Bo3 share of this queue's matches (0–1), null if unknown. */
  bo3Share: number | null;
}

/**
 * Aggregate decided matches by queue. Sorted by sample size, then WR.
 */
export function queueSplits(
  matches: TrackedMatch[],
  opts?: { minGames?: number },
): QueueSplitRow[] {
  const minGames = opts?.minGames ?? 1;
  const by = new Map<
    string,
    { wins: number; losses: number; bo3: number; total: number }
  >();

  for (const m of matches) {
    if (m.result !== "win" && m.result !== "loss") continue;
    const id = m.eventId || "Unknown";
    const row = by.get(id) ?? { wins: 0, losses: 0, bo3: 0, total: 0 };
    if (m.result === "win") row.wins++;
    else row.losses++;
    row.total++;
    if (m.bestOf === 3) row.bo3++;
    by.set(id, row);
  }

  return [...by.entries()]
    .map(([eventId, r]) => {
      const games = r.wins + r.losses;
      return {
        eventId,
        label: queueLabel(eventId),
        wins: r.wins,
        losses: r.losses,
        games,
        rate: games ? r.wins / games : null,
        bo3Share: r.total ? r.bo3 / r.total : null,
      } satisfies QueueSplitRow;
    })
    .filter((r) => r.games >= minGames)
    .sort(
      (a, b) =>
        b.games - a.games ||
        (b.rate ?? 0) - (a.rate ?? 0) ||
        a.label.localeCompare(b.label),
    );
}
