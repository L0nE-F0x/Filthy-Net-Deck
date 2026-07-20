/**
 * Pure presentation logic for the in-game overlay — kept free of React/Tauri
 * so it stays unit-testable (see overlayModel.test.ts).
 */
import type { LiveCardCount } from "../types/tracker";
import type { ArenaCardMeta } from "../services/arenaMeta";

export type OverlayGroupId = "land" | "creature" | "spell";

export interface OverlayRow {
  card: LiveCardCount;
  meta: ArenaCardMeta | null | undefined;
}

export interface OverlayGroup {
  id: OverlayGroupId;
  label: string;
  rows: OverlayRow[];
  /** Total copies remaining across the group. */
  remaining: number;
}

/** Broad bucket from the Scryfall type line: lands, then creatures, then everything else. */
export function cardGroupId(
  meta: ArenaCardMeta | null | undefined,
): OverlayGroupId {
  if (!meta) return "spell";
  if (meta.isLand) return "land";
  if (/\bCreature\b/.test(meta.typeLine)) return "creature";
  return "spell";
}

const GROUP_ORDER: { id: OverlayGroupId; label: string }[] = [
  { id: "land", label: "Lands" },
  { id: "creature", label: "Creatures" },
  { id: "spell", label: "Spells" },
];

/**
 * Group the remaining library into Lands / Creatures / Spells.
 * Within a group: cmc ascending (unknown last), then most copies, then name.
 */
export function groupLibrary(
  library: LiveCardCount[],
  metaOf: (grpId: number) => ArenaCardMeta | null | undefined,
): OverlayGroup[] {
  const buckets = new Map<OverlayGroupId, OverlayRow[]>();
  for (const card of library) {
    if (card.remaining <= 0) continue;
    const id = cardGroupId(metaOf(card.grpId));
    const rows = buckets.get(id);
    const row: OverlayRow = { card, meta: metaOf(card.grpId) };
    if (rows) rows.push(row);
    else buckets.set(id, [row]);
  }

  const groups: OverlayGroup[] = [];
  for (const { id, label } of GROUP_ORDER) {
    const rows = buckets.get(id);
    if (!rows || rows.length === 0) continue;
    rows.sort((a, b) => {
      // Lands have no meaningful cmc order — alpha by name.
      if (id === "land") {
        return (a.meta?.name ?? "").localeCompare(b.meta?.name ?? "");
      }
      const ca = a.meta?.cmc;
      const cb = b.meta?.cmc;
      if (ca != null || cb != null) {
        if (ca == null) return 1;
        if (cb == null) return -1;
        if (ca !== cb) return ca - cb;
      }
      if (b.card.remaining !== a.card.remaining) {
        return b.card.remaining - a.card.remaining;
      }
      return (a.meta?.name ?? "").localeCompare(b.meta?.name ?? "");
    });
    groups.push({
      id,
      label,
      rows,
      remaining: rows.reduce((n, r) => n + r.card.remaining, 0),
    });
  }
  return groups;
}

/**
 * Group the opponent's seen cards (distinct grpIds) with the same
 * Lands / Creatures / Spells sections as the library list.
 */
export function groupSeenCards(
  seen: number[] | null | undefined,
  metaOf: (grpId: number) => ArenaCardMeta | null | undefined,
): OverlayGroup[] {
  if (!seen?.length) return [];
  const distinct = [...new Set(seen.filter((id) => Number.isFinite(id)))];
  return groupLibrary(
    distinct.map((grpId) => ({ grpId, remaining: 1, total: 1 })),
    metaOf,
  );
}

/** Overlay list density — footprint knob. Compact is the product default. */
export type OverlayDensity = "cozy" | "compact" | "minimal";

export function normalizeDensity(value: unknown): OverlayDensity {
  return value === "cozy" || value === "minimal" ? value : "compact";
}

/** Chip text for the on-play/on-draw flag (null until turn 1 locks). */
export function playDrawLabel(
  onPlay: boolean | null | undefined,
): "Play" | "Draw" | null {
  if (onPlay == null) return null;
  return onPlay ? "Play" : "Draw";
}

/** Next-draw chance for at least this many copies still in library. */
export function drawPct(remaining: number, libraryTotal: number): number | null {
  if (libraryTotal <= 0 || remaining <= 0) return null;
  return Math.round((remaining / libraryTotal) * 1000) / 10; // one decimal
}

/** Split a Scryfall mana cost ("{2}{U}{U}") into symbols (["2","U","U"]). */
export function parseManaCost(manaCost: string | null | undefined): string[] {
  if (!manaCost) return [];
  const out: string[] = [];
  const re = /\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(manaCost)) !== null) {
    const sym = m[1].trim();
    if (sym) out.push(sym.toUpperCase());
  }
  return out;
}

export type PipTone = "w" | "u" | "b" | "r" | "g" | "c" | "x";

/** Color tone for one mana symbol — handles hybrids ("W/U") and Phyrexian ("W/P"). */
export function pipTone(symbol: string): PipTone {
  const first = symbol.charAt(0).toUpperCase();
  switch (first) {
    case "W":
      return "w";
    case "U":
      return "u";
    case "B":
      return "b";
    case "R":
      return "r";
    case "G":
      return "g";
    case "C":
      return "c";
    default:
      // Numbers, X, S (snow) — neutral grey.
      return "x";
  }
}

/** Display text inside a pip: hybrids keep "W/U" → "W/U" is too wide, show both letters. */
export function pipText(symbol: string): string {
  return symbol.replace(/\/P$/, "").replace("/", "");
}

/** Match clock from match start, m:ss (minutes can exceed 59). */
export function formatClock(startedAtMs: number, nowMs: number): string {
  const secs = Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** User-tunable panel opacity (Settings slider), clamped to a readable band. */
export function normalizeOpacity(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0.92;
  return Math.min(1, Math.max(0.55, Math.round(n * 100) / 100));
}

/* ------------------------------------------------------------------ */
/* B4 — historical matchup HUD line (pure; no focus / no side effects) */
/* ------------------------------------------------------------------ */

export interface MatchupHudRow {
  archetype: string;
  wins: number;
  losses: number;
  rate: number | null;
}

export interface MatchupHudLine {
  archetype: string;
  wins: number;
  losses: number;
  wrPct: number;
  /** Compact bar: "62% (5–3)" */
  short: string;
  /** Expanded: "5–3 (62%) on this deck" */
  detail: string;
  sample: number;
}

/**
 * Pick a personal matchup line for the live-inferred opponent archetype.
 * Requires `minSample` decided matches (default 2) — thin evidence stays hidden.
 */
export function matchupHudLine(
  rows: MatchupHudRow[],
  archetype: string | null | undefined,
  minSample = 2,
): MatchupHudLine | null {
  const name = archetype?.trim();
  if (!name || !rows.length) return null;
  const row = rows.find((r) => r.archetype === name);
  if (!row) return null;
  const sample = row.wins + row.losses;
  if (sample < minSample) return null;
  const wrPct =
    row.rate != null
      ? Math.round(row.rate * 100)
      : Math.round((row.wins / sample) * 100);
  return {
    archetype: name,
    wins: row.wins,
    losses: row.losses,
    wrPct,
    short: `${wrPct}% (${row.wins}–${row.losses})`,
    detail: `${row.wins}–${row.losses} (${wrPct}%) on this deck`,
    sample,
  };
}

/** Distinct opponent cards observed this match (for a quiet "n seen" chip). */
export function opponentCardsSeenCount(
  opponentSeen: number[] | null | undefined,
): number {
  if (!opponentSeen?.length) return 0;
  return new Set(opponentSeen.filter((id) => Number.isFinite(id))).size;
}
