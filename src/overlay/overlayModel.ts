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
 * Group the opponent's seen cards with the same Lands / Creatures / Spells
 * sections as the library list. Repeats in `seen` become the row quantity.
 */
export function groupSeenCards(
  seen: number[] | null | undefined,
  metaOf: (grpId: number) => ArenaCardMeta | null | undefined,
): OverlayGroup[] {
  if (!seen?.length) return [];
  const qty = new Map<number, number>();
  const order: number[] = [];
  for (const id of seen) {
    if (!Number.isFinite(id)) continue;
    if (!qty.has(id)) order.push(id);
    qty.set(id, (qty.get(id) ?? 0) + 1);
  }
  return groupLibrary(
    order.map((grpId) => {
      const n = qty.get(grpId) ?? 1;
      return { grpId, remaining: n, total: n };
    }),
    metaOf,
  );
}

/** Overlay list density — footprint knob. Compact is the product default. */
export type OverlayDensity = "cozy" | "compact" | "minimal";

export function normalizeDensity(value: unknown): OverlayDensity {
  return value === "cozy" || value === "minimal" ? value : "compact";
}

/**
 * How the match HUD window behaves. Overlay is the product default (over
 * Arena, match-lifetime). Companion is a normal persistent window — same
 * webview, different chrome. Do not add a fourth renderer for this.
 */
export type OverlayWindowMode = "overlay" | "companion";

export function normalizeWindowMode(value: unknown): OverlayWindowMode {
  return value === "companion" ? "companion" : "overlay";
}

/** Confidence as a short HUD chip, e.g. "72%". */
export function formatConfidencePct(confidence: number): string {
  if (!Number.isFinite(confidence)) return "";
  return `${Math.round(Math.min(1, Math.max(0, confidence)) * 100)}%`;
}

/** Decided W–L in `[fromMs, toMs]` (inclusive). `toMs` defaults to no upper bound. */
export function sessionWl(
  matches: Array<{ result: string; endedAt: number }>,
  fromMs: number,
  toMs = Number.POSITIVE_INFINITY,
): { wins: number; losses: number; wr: number | null } {
  let wins = 0;
  let losses = 0;
  for (const m of matches) {
    if (m.endedAt < fromMs || m.endedAt > toMs) continue;
    if (m.result === "win") wins++;
    else if (m.result === "loss") losses++;
  }
  const decided = wins + losses;
  return {
    wins,
    losses,
    wr: decided ? Math.round((wins / decided) * 100) : null,
  };
}

/**
 * Next-draw land headline for the collapsed bar. Same math as per-card
 * `drawPct` — remaining lands / remaining library.
 */
export function landDrawHeadline(
  landRemaining: number,
  libraryTotal: number,
): { pct: number; label: string; title: string } | null {
  const pct = drawPct(landRemaining, libraryTotal);
  if (pct == null) return null;
  const shown = Number.isInteger(pct) ? String(pct) : pct.toFixed(1);
  const landWord = landRemaining === 1 ? "land" : "lands";
  return {
    pct,
    label: `Land ${shown}%`,
    title: `Next card is a land: ${shown}% · ${landRemaining} ${landWord} left`,
  };
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

/**
 * Whether the overlay should show a Sideboard tab.
 * Bo3 queues (bestOf > 1) always get the tab; Bo1 only if GRE actually
 * reported sideboard cards (rare / edge cases).
 */
export function showSideboardTab(live: {
  bestOf?: number | null;
  sideboard?: LiveCardCount[] | null;
  sideboardTotal?: number | null;
}): boolean {
  if ((live.bestOf ?? 1) > 1) return true;
  if ((live.sideboardTotal ?? 0) > 0) return true;
  return (live.sideboard?.length ?? 0) > 0;
}
