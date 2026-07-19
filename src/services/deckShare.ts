/**
 * Deck share cards — turn a tracked deck + record into a branded PNG with the
 * real decklist, winrate, and Filthy Net Deck logo. Built to replace an
 * Untapped screenshot next to a gameplay post.
 *
 * This module keeps the aggregation pure/testable; the canvas renderer lives
 * alongside it (browser-only, called on user "Share").
 */
import type { ArenaCardInfo } from "./arenaCards";

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

const LIME = "#b8f000";
const INK = "#f2f4ea";
const MUTE = "#9aa38a";
const FAINT = "#5a6b5e";

const DOT: Record<DeckColor, string> = {
  w: "#f4e7bd",
  u: "#3487c9",
  b: "#7d736d",
  r: "#e0424a",
  g: "#22a55f",
  c: "#b9b9b9",
  multi: "#e8c56a",
};

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

function fontStack(spec: string): string {
  return `${spec} "Segoe UI", system-ui, sans-serif`;
}

/** Load the FND logo mark for the card header; null if it can't load. */
function loadLogo(): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = "/app-icon.png"; // Vite serves public/ at the web root.
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function ellipsize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + "…";
}

/** Draw a branded 1080×1350 deck card with the real list + record. */
export async function renderDeckSharePng(input: DeckShareInput): Promise<Blob> {
  const W = 1080;
  const H = 1350;
  const PAD = 64;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");

  // Background
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#05070420");
  grad.addColorStop(0, "#050604");
  grad.addColorStop(0.55, "#0e140c");
  grad.addColorStop(1, "#0a1008");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = LIME;
  ctx.fillRect(0, 0, W, 14);

  // Header — logo mark (top-right), wordmark + scope (left)
  const logo = await loadLogo();
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = INK;
  ctx.font = fontStack("700 40px");
  ctx.fillText("Filthy Net Deck", PAD, 96);
  ctx.fillStyle = MUTE;
  ctx.font = fontStack("500 25px");
  ctx.fillText(input.subtitle ?? scopeSubtitle(input.scope), PAD, 136);
  if (logo) {
    const s = 84;
    ctx.save();
    roundRect(ctx, W - PAD - s, 44, s, s, 18);
    ctx.clip();
    ctx.drawImage(logo, W - PAD - s, 44, s, s);
    ctx.restore();
    ctx.strokeStyle = "rgba(184,240,0,0.35)";
    ctx.lineWidth = 2;
    roundRect(ctx, W - PAD - s, 44, s, s, 18);
    ctx.stroke();
  }

  // Match badge (vs opp + result pill) sits above the deck name for matches.
  let y = 210;
  if (input.scope === "match" && (input.opponent || input.result)) {
    if (input.result) {
      const label =
        input.result === "win"
          ? "VICTORY"
          : input.result === "loss"
            ? "DEFEAT"
            : "DRAW";
      const pillColor =
        input.result === "win"
          ? "#34d399"
          : input.result === "loss"
            ? "#f87171"
            : "#fbbf24";
      ctx.font = fontStack("800 26px");
      const pw = ctx.measureText(label).width + 40;
      ctx.fillStyle = pillColor;
      roundRect(ctx, PAD, y - 34, pw, 46, 10);
      ctx.fill();
      ctx.fillStyle = "#07120b";
      ctx.fillText(label, PAD + 20, y);
      if (input.opponent) {
        ctx.fillStyle = MUTE;
        ctx.font = fontStack("500 28px");
        ctx.fillText(
          ellipsize(ctx, `vs ${input.opponent}`, W - PAD * 2 - pw - 24),
          PAD + pw + 20,
          y,
        );
      }
    } else if (input.opponent) {
      ctx.fillStyle = MUTE;
      ctx.font = fontStack("600 30px");
      ctx.fillText(ellipsize(ctx, `vs ${input.opponent}`, W - PAD * 2), PAD, y);
    }
    y += 56;
  } else {
    y = 232;
  }

  // Deck name hero (up to two lines)
  ctx.fillStyle = LIME;
  ctx.font = fontStack("800 66px");
  const nameLines: string[] = [];
  {
    const words = (input.deckName || "Untitled deck").split(" ");
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > W - PAD * 2 && line) {
        nameLines.push(line);
        line = w;
      } else line = test;
    }
    if (line) nameLines.push(line);
  }
  for (const l of nameLines.slice(0, 2)) {
    ctx.fillText(ellipsize(ctx, l, W - PAD * 2), PAD, y);
    y += 74;
  }
  y += 6;

  // Record band
  ctx.fillStyle = INK;
  ctx.font = fontStack("700 46px");
  const wrBits =
    input.winratePct != null
      ? `${input.wins}–${input.losses}  ·  ${input.winratePct}% WR`
      : `${input.wins}–${input.losses}`;
  ctx.fillText(wrBits, PAD, y);
  // games count to the right
  ctx.fillStyle = MUTE;
  ctx.font = fontStack("500 30px");
  const gamesLabel = `${input.games} game${input.games === 1 ? "" : "s"}`;
  ctx.fillText(gamesLabel, W - PAD - ctx.measureText(gamesLabel).width, y - 4);
  y += 50;

  // Rank / format / streak sub-line
  const subBits = [
    input.rankNow ? `Now ${input.rankNow}` : null,
    input.rankPeak && input.rankPeak !== input.rankNow
      ? `Peak ${input.rankPeak}`
      : null,
    input.format ?? null,
    input.bestOf && input.bestOf > 1 ? `Bo${input.bestOf}` : null,
    input.streakLabel ?? null,
  ].filter(Boolean) as string[];
  if (subBits.length) {
    ctx.fillStyle = "#e8c56a";
    ctx.font = fontStack("600 28px");
    ctx.fillText(ellipsize(ctx, subBits.join("   ·   "), W - PAD * 2), PAD, y);
    y += 40;
  }

  // Divider
  y += 8;
  ctx.strokeStyle = "rgba(184,240,0,0.22)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(W - PAD, y);
  ctx.stroke();
  y += 34;

  // Decklist — whole groups split across two balanced columns; row height
  // scales up so a short aggro list fills the card as well as a 60-card list.
  const listTop = y;
  const listBottom = H - 120;
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
  const unit = Math.max(
    38,
    Math.min(56, Math.floor((listBottom - listTop) / maxLines)),
  );
  const headSize = Math.max(20, Math.round(unit * 0.4));
  const rowSize = Math.max(22, Math.round(unit * 0.5));
  const dotR = Math.max(6, Math.round(unit * 0.14));

  const drawHeader = (label: string, count: number, x: number, baseY: number) => {
    ctx.fillStyle = MUTE;
    ctx.font = fontStack(`700 ${headSize}px`);
    ctx.fillText(label.toUpperCase(), x, baseY);
    const c = String(count);
    ctx.fillText(c, x + colW - ctx.measureText(c).width, baseY);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, baseY + Math.round(unit * 0.26));
    ctx.lineTo(x + colW, baseY + Math.round(unit * 0.26));
    ctx.stroke();
  };

  const drawRow = (row: DeckShareRow, x: number, baseY: number) => {
    ctx.fillStyle = DOT[row.color];
    ctx.beginPath();
    ctx.arc(x + dotR, baseY - Math.round(rowSize * 0.32), dotR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 1;
    ctx.stroke();
    const textX = x + dotR * 2 + 12;
    ctx.fillStyle = INK;
    ctx.font = fontStack(`700 ${rowSize}px`);
    ctx.fillText(`${row.qty}`, textX, baseY);
    const qtyW = ctx.measureText(`${row.qty}`).width;
    ctx.font = fontStack(`500 ${rowSize}px`);
    ctx.fillStyle = row.unresolved ? MUTE : "#e9ecdf";
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
      drawHeader(g.label, g.count, colX[c], cy);
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

  // Sideboard + overflow note
  const notes: string[] = [];
  if (input.list.sideboard > 0) notes.push(`+${input.list.sideboard} sideboard`);
  if (overflow > 0) notes.push(`+${overflow} more`);
  if (notes.length) {
    ctx.fillStyle = MUTE;
    ctx.font = fontStack("500 24px");
    ctx.fillText(notes.join("  ·  "), PAD, H - 108);
  }

  // Footer
  ctx.fillStyle = FAINT;
  ctx.font = fontStack("400 23px");
  ctx.fillText(
    "filthy-net-deck.netlify.app · Built by ApexForge",
    PAD,
    H - 52,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("PNG encode failed"))),
      "image/png",
    );
  });
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
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
