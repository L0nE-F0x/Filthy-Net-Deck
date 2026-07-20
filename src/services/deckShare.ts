/**
 * Deck share cards — turn a tracked deck + record into a branded PNG with the
 * real decklist, winrate, and Filthy Net Deck logo. Built to replace an
 * Untapped screenshot next to a gameplay post.
 *
 * This module keeps the aggregation pure/testable; the canvas renderer lives
 * alongside it (browser-only, called on user "Share") and is styled by
 * shareKit so every card in the app shares one design system.
 */
import type { ArenaCardInfo } from "./arenaCards";
import {
  BRAND,
  MANA_PIP,
  canvasToPng,
  chip,
  downloadBlob,
  drawFooter,
  drawHeader,
  drawPips,
  drawTracked,
  ellipsize,
  font,
  loadBrandLogo,
  makeCanvas,
  paintBackdrop,
  panel,
  pill,
  statTile,
  withAlpha,
  wrapLines,
  wrRing,
} from "./shareKit";

export type DeckColor = "w" | "u" | "b" | "r" | "g" | "c" | "multi";

export interface DeckShareRow {
  id: number;
  name: string;
  qty: number;
  cmc: number | null;
  color: DeckColor;
  /** True when Scryfall meta was missing (name falls back to "Card {id}"). */
  unresolved: boolean;
}

export type DeckGroupId = "creature" | "spell" | "land";

export interface DeckShareGroup {
  id: DeckGroupId;
  label: string;
  rows: DeckShareRow[];
  /** Total copies across the group. */
  count: number;
}

export interface DeckShareList {
  groups: DeckShareGroup[];
  /** Total mainboard copies. */
  total: number;
  /** Sideboard card count (copies), 0 when none recorded. */
  sideboard: number;
  /** How many distinct mainboard ids had no resolved name. */
  unresolved: number;
}

const COLOR_LETTERS = new Set(["W", "U", "B", "R", "G"]);

/**
 * Dominant color of a Scryfall mana cost ("{2}{W}{U}"):
 * one colored symbol → that color, two or more distinct → "multi", none → "c".
 * Hybrids ("{W/U}") count every color they contain.
 */
export function manaColorOf(manaCost: string | null | undefined): DeckColor {
  if (!manaCost) return "c";
  const colors = new Set<string>();
  const re = /\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(manaCost)) !== null) {
    for (const ch of m[1].toUpperCase()) {
      if (COLOR_LETTERS.has(ch)) colors.add(ch);
    }
  }
  if (colors.size === 0) return "c";
  if (colors.size > 1) return "multi";
  const only = [...colors][0];
  return only.toLowerCase() as DeckColor;
}

function groupIdFor(typeLine: string | undefined): DeckGroupId {
  const t = typeLine ?? "";
  if (/(?:^| )\bLand\b/.test(t)) return "land";
  if (/\bCreature\b/.test(t)) return "creature";
  return "spell";
}

// Decklist reading order: creatures, then other spells, then lands last.
const GROUP_ORDER: { id: DeckGroupId; label: string }[] = [
  { id: "creature", label: "Creatures" },
  { id: "spell", label: "Spells" },
  { id: "land", label: "Lands" },
];

/**
 * Aggregate the game-1 mainboard (Arena ids, repeats = quantity) into a
 * grouped decklist. `cards` is the resolved id → info map from
 * resolveArenaCards(); unknown ids fall back to "Card {id}".
 */
export function aggregateDeck(
  mainIds: number[] | undefined,
  sideIds: number[] | undefined,
  cards: Record<number, ArenaCardInfo>,
): DeckShareList {
  const qty = new Map<number, number>();
  for (const id of mainIds ?? []) {
    if (!Number.isFinite(id)) continue;
    qty.set(id, (qty.get(id) ?? 0) + 1);
  }

  const buckets = new Map<DeckGroupId, DeckShareRow[]>();
  let total = 0;
  let unresolved = 0;

  for (const [id, count] of qty) {
    const info = cards[id];
    const resolved = !!info?.name;
    if (!resolved) unresolved++;
    const row: DeckShareRow = {
      id,
      name: info?.name ?? `Card ${id}`,
      qty: count,
      cmc: typeof info?.cmc === "number" ? info.cmc : null,
      color: manaColorOf(info?.manaCost),
      unresolved: !resolved,
    };
    total += count;
    const gid = groupIdFor(info?.typeLine);
    const list = buckets.get(gid);
    if (list) list.push(row);
    else buckets.set(gid, [row]);
  }

  const groups: DeckShareGroup[] = [];
  for (const { id, label } of GROUP_ORDER) {
    const rows = buckets.get(id);
    if (!rows || !rows.length) continue;
    rows.sort((a, b) => {
      // cmc ascending, unknown last, then name.
      if (a.cmc == null && b.cmc != null) return 1;
      if (a.cmc != null && b.cmc == null) return -1;
      if (a.cmc != null && b.cmc != null && a.cmc !== b.cmc) return a.cmc - b.cmc;
      return a.name.localeCompare(b.name);
    });
    groups.push({
      id,
      label,
      rows,
      count: rows.reduce((n, r) => n + r.qty, 0),
    });
  }

  return {
    groups,
    total,
    sideboard: (sideIds ?? []).filter((id) => Number.isFinite(id)).length,
    unresolved,
  };
}

/* ------------------------------------------------------------------ */
/* Canvas share card (browser-only)                                    */
/* ------------------------------------------------------------------ */

export type ShareScope =
  | "match"
  | "session"
  | "day"
  | "run"
  | "week"
  | "season"
  | "all";

export interface DeckShareInput {
  scope: ShareScope;
  deckName: string;
  list: DeckShareList;
  wins: number;
  losses: number;
  draws?: number;
  /** 0–100, or null when nothing decided. */
  winratePct: number | null;
  games: number;
  /** Optional override for the small line under the wordmark. */
  subtitle?: string;
  rankNow?: string | null;
  rankPeak?: string | null;
  format?: string | null;
  bestOf?: number | null;
  streakLabel?: string | null;
  /** Match scope only. */
  opponent?: string | null;
  result?: "win" | "loss" | "draw" | null;
}

function scopeSubtitle(scope: ShareScope): string {
  switch (scope) {
    case "match":
      return "Match snapshot · tracked locally";
    case "session":
      return "This session · tracked locally";
    case "day":
      return "Today · tracked locally";
    case "run":
      return "Fresh run · tracked locally";
    case "week":
      return "Last 7 days · tracked locally";
    case "season":
      return "This season · tracked locally";
    case "all":
      return "All-time · tracked locally";
  }
}

function scopeSlug(scope: ShareScope): string {
  return scope;
}

/** WUBRG identity of the mainboard (gold pip for multi-only decks). */
function colorIdentity(list: DeckShareList): string[] {
  const present = new Set<string>();
  let multi = 0;
  for (const g of list.groups) {
    for (const r of g.rows) {
      if (r.color === "multi") multi += r.qty;
      else if (r.color !== "c") present.add(r.color);
    }
  }
  const keys = ["w", "u", "b", "r", "g"].filter((k) => present.has(k));
  if (!keys.length && multi > 0) keys.push("multi");
  return keys;
}

/** Draw a branded 1080×1350 deck card with the real list + record. */
export async function renderDeckSharePng(input: DeckShareInput): Promise<Blob> {
  const W = 1080;
  const H = 1350;
  const PAD = 64;
  const { canvas, ctx } = makeCanvas(W, H);

  paintBackdrop(ctx, W, H);
  const logo = await loadBrandLogo();
  let y = drawHeader(ctx, W, {
    kicker: input.subtitle ?? scopeSubtitle(input.scope),
    logo,
  });

  // Match badge (result pill + opponent) sits above the deck name.
  if (input.scope === "match" && (input.opponent || input.result)) {
    let bx = PAD;
    if (input.result) {
      const label =
        input.result === "win"
          ? "VICTORY"
          : input.result === "loss"
            ? "DEFEAT"
            : "DRAW";
      const color =
        input.result === "win"
          ? BRAND.win
          : input.result === "loss"
            ? BRAND.loss
            : BRAND.draw;
      bx += pill(ctx, bx, y + 4, label, color, 24) + 20;
    }
    if (input.opponent) {
      ctx.fillStyle = BRAND.mute;
      ctx.font = font("500 28px");
      ctx.fillText(
        ellipsize(ctx, `vs ${input.opponent}`, W - PAD - bx),
        bx,
        y + 38,
      );
    }
    y += 84;
  } else {
    y += 24;
  }

  // Deck name hero (up to two lines, shrinking to fit).
  const deckName = input.deckName || "Untitled deck";
  let namePx = 62;
  let nameLines: string[] = [];
  while (namePx > 34) {
    ctx.font = font(`800 ${namePx}px`);
    nameLines = wrapLines(ctx, deckName, W - PAD * 2);
    if (nameLines.length <= 2) break;
    namePx -= 2;
  }
  ctx.font = font(`800 ${namePx}px`);
  ctx.fillStyle = BRAND.lime;
  for (const l of nameLines.slice(0, 2)) {
    ctx.fillText(ellipsize(ctx, l, W - PAD * 2), PAD, y + namePx * 0.82);
    y += namePx * 1.12;
  }
  y += 18;

  // Color identity pips.
  const identity = colorIdentity(input.list);
  if (identity.length) {
    drawPips(ctx, PAD, y + 12, identity, 13);
    y += 40;
  }

  // Format / Bo / streak chips.
  const chipBits = [
    input.format ?? null,
    input.bestOf && input.bestOf > 1 ? `Bo${input.bestOf}` : null,
    input.streakLabel ?? null,
  ].filter((b): b is string => !!b);
  if (chipBits.length) {
    let cx = PAD;
    for (const bit of chipBits.slice(0, 3)) {
      if (cx > W - PAD - 120) break;
      cx += chip(ctx, cx, y, bit, BRAND.gold, 21) + 14;
    }
    y += 54;
  }

  // Stat band: WR ring + record + rank/form tiles.
  y += 14;
  const bandH = 196;
  const ringW = 280;
  panel(ctx, PAD, y, ringW, bandH, 22);
  wrRing(ctx, PAD + ringW / 2, y + bandH / 2 + 4, 72, input.winratePct);

  const tileW = (W - PAD * 2 - ringW - 2 * 20) / 2;
  const gamesLabel = `${input.games} game${input.games === 1 ? "" : "s"}`;
  statTile(ctx, PAD + ringW + 20, y, tileW, bandH, {
    label: "Record",
    value: `${input.wins}–${input.losses}`,
    sub: gamesLabel,
  });
  const sideTile = input.rankNow
    ? {
        label: "Rank now",
        value: input.rankNow,
        sub:
          input.rankPeak && input.rankPeak !== input.rankNow
            ? `Peak ${input.rankPeak}`
            : null,
      }
    : input.streakLabel
      ? { label: "Form", value: input.streakLabel, sub: null }
      : {
          label: "Window",
          value: scopeWindowLabel(input.scope),
          sub: null,
        };
  statTile(ctx, PAD + ringW + 20 + tileW + 20, y, tileW, bandH, sideTile);
  y += bandH + 40;

  // Decklist header.
  ctx.fillStyle = BRAND.mute;
  ctx.font = font("600 20px");
  drawTracked(ctx, "DECKLIST", PAD, y, 3);
  const totalBits = [`${input.list.total} cards`];
  if (input.list.sideboard > 0) totalBits.push(`+${input.list.sideboard} sideboard`);
  ctx.font = font("500 23px");
  const totalLabel = totalBits.join("  ·  ");
  ctx.fillText(totalLabel, W - PAD - ctx.measureText(totalLabel).width, y);
  y += 16;
  ctx.strokeStyle = withAlpha(BRAND.lime, 0.25);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(W - PAD, y);
  ctx.stroke();
  y += 26;

  // Decklist — whole groups split across two balanced columns; row height
  // scales up so a short aggro list fills the card as well as a 60-card list.
  const listTop = y;
  const listBottom = H - 128;
  const gutter = 48;
  const colW = (W - PAD * 2 - gutter) / 2;
  const colX = [PAD, PAD + colW + gutter];

  const groups = input.list.groups;
  const gLines = groups.map((g) => 1 + g.rows.length); // header + rows
  const totalLines = gLines.reduce((a, b) => a + b, 0);
  let split = groups.length; // groups[0..split) → col0, rest → col1
  {
    let bestDiff = Infinity;
    for (let k = 1; k <= groups.length; k++) {
      const before = gLines.slice(0, k).reduce((a, b) => a + b, 0);
      const diff = Math.abs(before - (totalLines - before));
      if (diff < bestDiff) {
        bestDiff = diff;
        split = k;
      }
    }
  }
  const colGroups = [groups.slice(0, split), groups.slice(split)];
  const colLines = colGroups.map((gs) =>
    gs.reduce((a, g) => a + 1 + g.rows.length, 0),
  );
  const maxLines = Math.max(1, colLines[0], colLines[1]);
  // Reserve room for the initial 0.72-unit offset and inter-group gaps so
  // nothing overflows past listBottom.
  const maxGroups = Math.max(colGroups[0].length, colGroups[1].length, 1);
  const effectiveLines = maxLines + 0.72 + 0.3 * (maxGroups - 1);
  const unit = Math.max(
    36,
    Math.min(60, Math.floor((listBottom - listTop) / effectiveLines)),
  );
  const headSize = Math.max(19, Math.round(unit * 0.38));
  const rowSize = Math.max(22, Math.round(unit * 0.48));
  const dotR = Math.max(6, Math.round(unit * 0.13));

  const drawGroupHeader = (label: string, count: number, x: number, baseY: number) => {
    ctx.fillStyle = BRAND.mute;
    ctx.font = font(`700 ${headSize}px`);
    drawTracked(ctx, label.toUpperCase(), x, baseY, 2);
    const c = String(count);
    ctx.fillStyle = BRAND.lime;
    ctx.fillText(c, x + colW - ctx.measureText(c).width, baseY);
    ctx.strokeStyle = "rgba(255,255,255,0.09)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, baseY + Math.round(unit * 0.28));
    ctx.lineTo(x + colW, baseY + Math.round(unit * 0.28));
    ctx.stroke();
  };

  const drawRow = (row: DeckShareRow, x: number, baseY: number) => {
    const pipColor = MANA_PIP[row.color] ?? BRAND.mute;
    const cyDot = baseY - Math.round(rowSize * 0.32);
    const grad = ctx.createRadialGradient(
      x + dotR * 0.4,
      cyDot - dotR * 0.4,
      dotR * 0.2,
      x + dotR,
      cyDot,
      dotR * 1.3,
    );
    grad.addColorStop(0, withAlpha(pipColor, 0.95));
    grad.addColorStop(1, withAlpha(pipColor, 0.7));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x + dotR, cyDot, dotR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = 1;
    ctx.stroke();
    const textX = x + dotR * 2 + 12;
    ctx.fillStyle = BRAND.lime;
    ctx.font = font(`700 ${rowSize}px`);
    ctx.fillText(`${row.qty}`, textX, baseY);
    const qtyW = ctx.measureText(`${row.qty}`).width;
    ctx.font = font(`500 ${rowSize}px`);
    ctx.fillStyle = row.unresolved ? BRAND.mute : BRAND.paper;
    ctx.fillText(
      ellipsize(ctx, row.name, colW - (textX - x) - qtyW - 14),
      textX + qtyW + 14,
      baseY,
    );
  };

  let overflow = 0;
  for (let c = 0; c < 2; c++) {
    let cy = listTop + Math.round(unit * 0.72);
    let first = true;
    for (const g of colGroups[c]) {
      if (!first) cy += Math.round(unit * 0.3);
      first = false;
      if (cy + unit > listBottom) {
        overflow += g.rows.length; // no room for this group at all
        continue;
      }
      drawGroupHeader(g.label, g.count, colX[c], cy);
      cy += unit;
      for (const row of g.rows) {
        if (cy + unit > listBottom) {
          overflow++;
          continue;
        }
        drawRow(row, colX[c], cy);
        cy += unit;
      }
    }
  }

  if (overflow > 0) {
    ctx.fillStyle = BRAND.mute;
    ctx.font = font("500 22px");
    ctx.fillText(`+${overflow} more`, PAD, H - 104);
  }

  drawFooter(ctx, W, H, PAD);
  return canvasToPng(canvas);
}

function scopeWindowLabel(scope: ShareScope): string {
  switch (scope) {
    case "match":
      return "Match";
    case "session":
      return "Session";
    case "day":
      return "Today";
    case "run":
      return "Run";
    case "week":
      return "7 days";
    case "season":
      return "Season";
    case "all":
      return "All-time";
  }
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "deck"
  );
}

export async function downloadDeckSharePng(
  input: DeckShareInput,
  filename?: string,
): Promise<void> {
  const blob = await renderDeckSharePng(input);
  const name =
    filename ??
    `filthy-net-deck-${slugify(input.deckName)}-${scopeSlug(input.scope)}.png`;
  downloadBlob(blob, name);
}
