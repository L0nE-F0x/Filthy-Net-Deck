/**
 * B&R pulse — notices when the published ban lists change (a real-world
 * Banned & Restricted announcement) and surfaces it on the Decks home.
 *
 * Snapshot semantics mirror setPulse: first sight of a ban list is the
 * baseline (no alert flood on install); afterwards any difference between
 * the feed and the last-acknowledged snapshot is a change worth showing
 * until the user opens the Format hub or dismisses the banner.
 */
import type { BannedCard, FormatHub } from "../types/sets";

const SNAP_KEY = "bbi.bans.snap";
const NOTIFIED_KEY = "bbi.bans.notifiedSig";

export type BanFormat = "standard" | "pioneer";

/** format -> sorted lowercased card names last acknowledged by the user */
export type BanSnap = Partial<Record<BanFormat, string[]>>;

export interface BanChange {
  format: BanFormat;
  /** Newly banned since the snapshot (full card info from the feed). */
  added: BannedCard[];
  /** Unbanned since the snapshot (names only — they left the feed). */
  removed: string[];
}

function normName(name: string): string {
  return name.trim().toLowerCase();
}

function hubBans(hub: FormatHub | null | undefined, format: BanFormat): BannedCard[] | null {
  const bans = hub?.[format]?.bans;
  return Array.isArray(bans) ? bans : null;
}

export function loadBanSnap(): BanSnap | null {
  try {
    const raw = localStorage.getItem(SNAP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BanSnap;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function saveBanSnap(hub: FormatHub | null | undefined): void {
  const snap: BanSnap = {};
  for (const format of ["standard", "pioneer"] as const) {
    const bans = hubBans(hub, format);
    // A format missing from the feed keeps its previous baseline — never
    // treat a feed hiccup as "everything got unbanned".
    if (bans) snap[format] = bans.map((b) => normName(b.name)).sort();
    else {
      const prev = loadBanSnap()?.[format];
      if (prev) snap[format] = prev;
    }
  }
  if (!Object.keys(snap).length) return;
  try {
    localStorage.setItem(SNAP_KEY, JSON.stringify(snap));
  } catch {
    /* ignore */
  }
}

/**
 * Diff the feed's ban lists against the last-acknowledged snapshot.
 * A format with no snapshot yet produces no change (baseline, not news).
 */
export function diffBans(
  hub: FormatHub | null | undefined,
  prev: BanSnap | null,
): BanChange[] {
  const out: BanChange[] = [];
  for (const format of ["standard", "pioneer"] as const) {
    const bans = hubBans(hub, format);
    const prevNames = prev?.[format];
    if (!bans || !prevNames) continue;
    const prevSet = new Set(prevNames);
    const curSet = new Set(bans.map((b) => normName(b.name)));
    const added = bans.filter((b) => !prevSet.has(normName(b.name)));
    const removed = prevNames.filter((n) => !curSet.has(n));
    if (added.length || removed.length) out.push({ format, added, removed });
  }
  return out;
}

/** True when the feed has ban data a snapshot doesn't cover yet. */
export function needsBaseline(hub: FormatHub | null | undefined, prev: BanSnap | null): boolean {
  for (const format of ["standard", "pioneer"] as const) {
    if (hubBans(hub, format) && !prev?.[format]) return true;
  }
  return false;
}

/** Stable signature of a change set — used to fire the desktop toast once. */
export function banChangeSignature(changes: BanChange[]): string {
  return changes
    .map(
      (c) =>
        `${c.format}:+${c.added.map((b) => normName(b.name)).sort().join(",")}` +
        `:-${[...c.removed].sort().join(",")}`,
    )
    .sort()
    .join("|");
}

export function shouldFireBanNotify(signature: string): boolean {
  try {
    return localStorage.getItem(NOTIFIED_KEY) !== signature;
  } catch {
    return true;
  }
}

export function markBanNotifyFired(signature: string): void {
  try {
    localStorage.setItem(NOTIFIED_KEY, signature);
  } catch {
    /* ignore */
  }
}

const FORMAT_LABEL: Record<BanFormat, string> = {
  standard: "Standard",
  pioneer: "Pioneer",
};

/** "Standard: 2 banned, 1 unbanned · Pioneer: 1 banned" */
export function summarizeBanChanges(changes: BanChange[]): string {
  return changes
    .map((c) => {
      const bits: string[] = [];
      if (c.added.length) bits.push(`${c.added.length} banned`);
      if (c.removed.length) bits.push(`${c.removed.length} unbanned`);
      return `${FORMAT_LABEL[c.format]}: ${bits.join(", ")}`;
    })
    .join(" · ");
}

/** Up to `max` card names for the banner detail, newly banned first. */
export function headlineCards(changes: BanChange[], max = 3): string[] {
  const names: string[] = [];
  for (const c of changes) for (const b of c.added) names.push(b.name);
  for (const c of changes) for (const n of c.removed) names.push(n);
  return names.slice(0, max);
}
