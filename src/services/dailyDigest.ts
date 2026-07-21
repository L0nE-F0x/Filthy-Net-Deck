/**
 * D2 (light) — "since you last opened" digest chips for the Daily home board.
 * Pure aggregation only; UI assembles chips. No AI / no network.
 */

import type { TrackedMatch } from "../types/tracker";
import type { MetaChange } from "./metaDiff";
import { formatRank, parseRank } from "./ranks";

export type DigestChipKind = "record" | "rank" | "meta" | "streak" | "rotation";

export interface DigestChip {
  id: string;
  kind: DigestChipKind;
  /** Short headline, e.g. "3–1" or "↑ Izzet Prowess". */
  label: string;
  /** Supporting line. */
  detail: string;
}

export interface DigestWindow {
  fromMs: number;
  toMs: number;
  /** Human label for the window. */
  label: string;
}

const LAST_OPEN_KEY = "bbi.daily.lastOpenAt";

/** Read the previous-session open stamp (null on first run). */
export function readLastOpenAt(): number | null {
  try {
    const raw = localStorage.getItem(LAST_OPEN_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** Stamp "now" as last open after the digest has been computed for this visit. */
export function writeLastOpenAt(nowMs = Date.now()): void {
  try {
    localStorage.setItem(LAST_OPEN_KEY, String(nowMs));
  } catch {
    /* ignore */
  }
}

/**
 * Prefer "since last open" when that stamp is older than ~2h and in the past.
 * Otherwise fall back to local calendar yesterday → now (covers first run / same session).
 */
export function digestWindow(
  nowMs: number,
  lastOpenMs: number | null,
): DigestWindow {
  const minGap = 2 * 3600_000;
  if (lastOpenMs != null && lastOpenMs < nowMs - minGap) {
    return {
      fromMs: lastOpenMs,
      toMs: nowMs,
      label: "Since last open",
    };
  }
  // Local yesterday midnight → now (captures "what happened yesterday + today so far")
  const d = new Date(nowMs);
  const todayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const fromMs = todayStart - 86400000;
  return {
    fromMs,
    toMs: nowMs,
    label: "Yesterday + today",
  };
}

export function recordInWindow(
  matches: TrackedMatch[],
  fromMs: number,
  toMs: number,
): { wins: number; losses: number; games: number; wrPct: number | null } {
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
    games: decided,
    wrPct: decided ? Math.round((wins / decided) * 100) : null,
  };
}

/** First and last rank stamps in the window (chronological). */
export function rankDeltaInWindow(
  matches: TrackedMatch[],
  fromMs: number,
  toMs: number,
): { from: string; to: string } | null {
  const ranked = matches
    .filter((m) => m.endedAt >= fromMs && m.endedAt <= toMs && m.myRank)
    .map((m) => ({ at: m.endedAt, rank: parseRank(m.myRank) }))
    .filter(
      (x): x is { at: number; rank: NonNullable<ReturnType<typeof parseRank>> } =>
        x.rank != null,
    )
    .sort((a, b) => a.at - b.at);
  if (ranked.length < 2) return null;
  const a = ranked[0].rank;
  const b = ranked[ranked.length - 1].rank;
  if (Math.abs(b.score - a.score) < 0.01) return null;
  return { from: formatRank(a), to: formatRank(b) };
}

/** Pick one meta headline for the active format/mode (rose > entered > fell). */
export function topMetaMover(
  changes: MetaChange[],
  formatId: string | null | undefined,
  mode: "bo1" | "bo3",
): { name: string; kind: "rose" | "entered" | "fell" } | null {
  if (!changes.length) return null;
  const pool = formatId
    ? changes.filter((c) => c.formatId === formatId && c.mode === mode)
    : changes.filter((c) => c.mode === mode);
  const list = pool.length ? pool : changes;
  for (const ch of list) {
    if (ch.rose[0]) return { name: ch.rose[0], kind: "rose" };
  }
  for (const ch of list) {
    if (ch.entered[0]) return { name: ch.entered[0], kind: "entered" };
  }
  for (const ch of list) {
    if (ch.fell[0]) return { name: ch.fell[0], kind: "fell" };
  }
  return null;
}

/**
 * Build up to 3 light chips. Empty when there's nothing useful to say
 * (no matches in window, no rank move, no meta movement).
 */
export function buildDailyDigest(input: {
  matches: TrackedMatch[];
  nowMs: number;
  lastOpenMs: number | null;
  metaChanges: MetaChange[];
  formatId?: string | null;
  mode: "bo1" | "bo3";
  /** Current win/loss streak (optional filler chip). */
  streak?: { type: "win" | "loss" | null; length: number } | null;
  /** Days until Standard rotation (optional filler chip). */
  rotationDays?: number | null;
}): { window: DigestWindow; chips: DigestChip[] } {
  const window = digestWindow(input.nowMs, input.lastOpenMs);
  const chips: DigestChip[] = [];

  const rec = recordInWindow(input.matches, window.fromMs, window.toMs);
  if (rec.games > 0) {
    chips.push({
      id: "record",
      kind: "record",
      label:
        rec.wrPct != null
          ? `${rec.wins}–${rec.losses} · ${rec.wrPct}%`
          : `${rec.wins}–${rec.losses}`,
      detail: `${window.label} · ${rec.games} decided`,
    });
  }

  const rank = rankDeltaInWindow(input.matches, window.fromMs, window.toMs);
  if (rank) {
    chips.push({
      id: "rank",
      kind: "rank",
      label: `${rank.from} → ${rank.to}`,
      detail: `${window.label} · rank path`,
    });
  }

  const mover = topMetaMover(input.metaChanges, input.formatId, input.mode);
  if (mover) {
    const verb =
      mover.kind === "rose" ? "Rising" : mover.kind === "entered" ? "New" : "Falling";
    chips.push({
      id: "meta",
      kind: "meta",
      label: `${verb}: ${mover.name}`,
      detail: "Meta board movement",
    });
  }

  // Fill remaining slots (max 3) with streak / rotation when primary chips are thin.
  if (
    chips.length < 3 &&
    input.streak?.type &&
    input.streak.length >= 2
  ) {
    chips.push({
      id: "streak",
      kind: "streak",
      label: `${input.streak.type === "win" ? "W" : "L"} streak ×${input.streak.length}`,
      detail: "Current run · decided matches",
    });
  }

  if (
    chips.length < 3 &&
    input.rotationDays != null &&
    input.rotationDays >= 0 &&
    input.rotationDays <= 90
  ) {
    const d = input.rotationDays;
    chips.push({
      id: "rotation",
      kind: "rotation",
      label:
        d === 0 ? "Rotates today" : d === 1 ? "Rotates tomorrow" : `Rotation in ${d}d`,
      detail: "Standard rotation",
    });
  }

  return { window, chips: chips.slice(0, 3) };
}
