/**
 * Backed-up decklists, indexed by `deckHash`, for filling gaps in local
 * history (Phase 2 slice 7).
 *
 * Fetched once per app session and shared by every caller: the list is small,
 * it only changes when the user plays, and paying for it per mounted component
 * would be silly. Resolves to an empty map when the user is signed out, opted
 * out, or offline — every consumer treats "no backup" as the normal case, so
 * nothing here ever surfaces an error.
 */

import { useEffect, useState } from "react";
import type { RestoredList } from "../deckVersions";

let cache: Promise<Map<string, RestoredList>> | null = null;

async function load(): Promise<Map<string, RestoredList>> {
  try {
    const { cloudDecksNow } = await import("./syncRunner");
    const decks = await cloudDecksNow();
    const out = new Map<string, RestoredList>();
    for (const d of decks) out.set(d.deckHash, { main: d.main, side: d.side });
    return out;
  } catch {
    return new Map();
  }
}

/** Drop the memo — call after opting out, so a stale library cannot linger. */
export function clearCloudDeckCache() {
  cache = null;
}

export function useCloudDeckLists(): ReadonlyMap<string, RestoredList> {
  const [lists, setLists] = useState<ReadonlyMap<string, RestoredList>>(
    () => new Map(),
  );
  useEffect(() => {
    let cancelled = false;
    cache ??= load();
    void cache.then((m) => {
      if (!cancelled && m.size) setLists(m);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return lists;
}
