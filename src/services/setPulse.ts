/**
 * Local set-radar helpers: new-since-last-visit snapshot + Arena-eve signals.
 */
import type { SetsBundle, UpcomingSet } from "../types/sets";
import { setGalleryCards } from "../types/sets";

const SNAP_KEY = "bbi.sets.cardSnap";
const NOTIFY_DAY_KEY = "bbi.sets.arenaNotifyDay";

export type CardSnap = Record<string, string[]>; // setCode -> scryfallIds

export function loadCardSnap(): CardSnap {
  try {
    const raw = localStorage.getItem(SNAP_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as CardSnap;
  } catch {
    return {};
  }
}

export function saveCardSnap(bundle: SetsBundle): void {
  const snap: CardSnap = {};
  for (const s of bundle.sets) {
    snap[s.code] = setGalleryCards(s).map((c) => c.scryfallId);
  }
  try {
    localStorage.setItem(SNAP_KEY, JSON.stringify(snap));
  } catch {
    /* ignore */
  }
}

/** Cards present in bundle but missing from the previous local snapshot. */
export function newCardsBySet(bundle: SetsBundle, prev: CardSnap): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const s of bundle.sets) {
    const prevIds = new Set(prev[s.code] || []);
    // First visit: no "new" flood — treat empty snap as baseline after save
    if (!prev[s.code]) continue;
    const fresh = setGalleryCards(s)
      .filter((c) => !prevIds.has(c.scryfallId))
      .map((c) => c.scryfallId);
    if (fresh.length) out[s.code] = fresh;
  }
  return out;
}

export function totalNewCount(newBySet: Record<string, string[]>): number {
  return Object.values(newBySet).reduce((n, ids) => n + ids.length, 0);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(`${iso}T12:00:00`).getTime();
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  return Math.round((t - now.getTime()) / 86400000);
}

export interface SpoilerPulseItem {
  code: string;
  name: string;
  status: UpcomingSet["status"];
  arenaIn: number | null;
  arenaDate: string | null;
  arenaConfidence: string;
  spoiledCount: number;
  newCount: number;
  kind: "spoiling" | "arena_soon" | "arena_tomorrow" | "arena_today";
}

/** Sets worth a Decks-home pulse: spoiling, or Arena within 14 days. */
export function buildSpoilerPulse(
  bundle: SetsBundle | null,
  newBySet: Record<string, string[]>,
): SpoilerPulseItem[] {
  if (!bundle?.sets?.length) return [];
  const items: SpoilerPulseItem[] = [];
  for (const s of bundle.sets) {
    const arenaIn = daysUntil(s.dates.arena);
    const newCount = newBySet[s.code]?.length ?? 0;
    let kind: SpoilerPulseItem["kind"] | null = null;
    if (arenaIn === 0) kind = "arena_today";
    else if (arenaIn === 1) kind = "arena_tomorrow";
    else if (arenaIn != null && arenaIn > 1 && arenaIn <= 14) kind = "arena_soon";
    else if (s.status === "spoiling") kind = "spoiling";
    if (!kind) continue;
    items.push({
      code: s.code,
      name: s.name,
      status: s.status,
      arenaIn,
      arenaDate: s.dates.arena,
      arenaConfidence: s.datesConfidence.arena,
      spoiledCount: s.spoiledCount,
      newCount,
      kind,
    });
  }
  // Soonest Arena / most urgent first
  const rank = { arena_today: 0, arena_tomorrow: 1, arena_soon: 2, spoiling: 3 };
  items.sort((a, b) => {
    const ra = rank[a.kind];
    const rb = rank[b.kind];
    if (ra !== rb) return ra - rb;
    return (a.arenaIn ?? 99) - (b.arenaIn ?? 99);
  });
  return items;
}

/** Days until the nearest upcoming Arena drop (0 = today), or null. */
export function nextArenaDropInDays(bundle: SetsBundle | null): number | null {
  if (!bundle?.sets) return null;
  let best: number | null = null;
  for (const s of bundle.sets) {
    const d = daysUntil(s.dates.arena);
    if (d == null || d < 0) continue;
    if (best == null || d < best) best = d;
  }
  return best;
}

/** Sets with Arena drop tomorrow (for tray notification). */
export function arenaTomorrowSets(bundle: SetsBundle | null): UpcomingSet[] {
  if (!bundle?.sets) return [];
  return bundle.sets.filter((s) => daysUntil(s.dates.arena) === 1);
}

export function shouldFireArenaNotify(): boolean {
  try {
    return localStorage.getItem(NOTIFY_DAY_KEY) !== todayIso();
  } catch {
    return true;
  }
}

export function markArenaNotifyFired(): void {
  try {
    localStorage.setItem(NOTIFY_DAY_KEY, todayIso());
  } catch {
    /* ignore */
  }
}
