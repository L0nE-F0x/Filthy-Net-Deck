/**
 * A5 — personal matchup share card.
 * Renders a branded PNG from B1/B2 matchup rows (real cards seen → archetypes).
 * Aggregation stays pure; canvas is browser-only on user share.
 */

import type { DeckMatchupRow } from "./gameAnalytics";
import { matchupCaption } from "./communityShare";

export interface MatchupShareLine {
  archetype: string;
  wins: number;
  losses: number;
  rate: number | null;
  deckId: string | null;
}

export interface MatchupShareInput {
  deckName: string;
  /** Overall W–L on this deck across the matchup sample (or full deck). */
  wins: number;
  losses: number;
  rows: MatchupShareLine[];
  formatHint?: string | null;
}

const LIME = "#b8f000";
const INK = "#f2f4ea";
const MUTE = "#9aa38a";
const FAINT = "#5a6b5e";
const GOLD = "#e8c56a";

function fontStack(spec: string): string {
  return `${spec} "Segoe UI", system-ui, sans-serif`;
}

function ellipsize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) {
    t = t.slice(0, -1);
  }
  return `${t}…`;
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

/**
 * Package matchup rows for share. Keeps only rows with at least one decided
 * match; trims to `limit` (default 8) in caller sort order.
 */
export function packageMatchupShare(
  deckName: string,
  rows: DeckMatchupRow[],
  opts?: {
    /** Override overall W–L (defaults to sum of row match records). */
    overall?: { wins: number; losses: number };
    limit?: number;
    formatHint?: string | null;
  },
): MatchupShareInput | null {
  const limit = opts?.limit ?? 8;
  const lines: MatchupShareLine[] = rows
    .filter((r) => r.wins + r.losses > 0)
    .slice(0, limit)
    .map((r) => ({
      archetype: r.archetype,
      wins: r.wins,
      losses: r.losses,
      rate: r.rate,
      deckId: r.deckId,
    }));
  if (!lines.length) return null;

  let wins = opts?.overall?.wins;
  let losses = opts?.overall?.losses;
  if (wins == null || losses == null) {
    wins = lines.reduce((n, r) => n + r.wins, 0);
    losses = lines.reduce((n, r) => n + r.losses, 0);
  }

  return {
    deckName: deckName.trim() || "My deck",
    wins,
    losses,
    rows: lines,
    formatHint: opts?.formatHint ?? null,
  };
}

/** Caption + optional SEO deep-link for the top meta-matched row. */
export function matchupShareCaption(
  input: MatchupShareInput,
  metaDeckUrlFor?: (deckId: string) => string,
): string {
  const top = input.rows[0];
  const metaDeckUrl =
    top?.deckId && metaDeckUrlFor ? metaDeckUrlFor(top.deckId) : null;
  return matchupCaption({
    deckName: input.deckName,
    wins: input.wins,
    losses: input.losses,
    topLines: input.rows.map((r) => ({
      archetype: r.archetype,
      wins: r.wins,
      losses: r.losses,
    })),
    metaDeckUrl,
  });
}

function loadLogo(): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = "/app-icon.png";
  });
}

/** 1080×1350 matchup matrix card — personal WR by inferred archetype. */
export async function renderMatchupSharePng(
  input: MatchupShareInput,
): Promise<Blob> {
  const W = 1080;
  const H = 1350;
  const PAD = 64;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");

  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#050604");
  grad.addColorStop(0.55, "#0e140c");
  grad.addColorStop(1, "#0a1008");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = LIME;
  ctx.fillRect(0, 0, W, 14);

  const logo = await loadLogo();
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = INK;
  ctx.font = fontStack("700 40px");
  ctx.fillText("Filthy Net Deck", PAD, 96);
  ctx.fillStyle = MUTE;
  ctx.font = fontStack("500 25px");
  ctx.fillText("Personal matchups · cards actually seen", PAD, 136);
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

  let y = 230;
  ctx.fillStyle = LIME;
  ctx.font = fontStack("800 58px");
  const name = ellipsize(ctx, input.deckName, W - PAD * 2);
  ctx.fillText(name, PAD, y);
  y += 72;

  const decided = input.wins + input.losses;
  const wr = decided ? Math.round((input.wins / decided) * 100) : null;
  ctx.fillStyle = INK;
  ctx.font = fontStack("700 44px");
  ctx.fillText(
    wr != null
      ? `${input.wins}–${input.losses}  ·  ${wr}% WR`
      : `${input.wins}–${input.losses}`,
    PAD,
    y,
  );
  y += 40;
  if (input.formatHint) {
    ctx.fillStyle = GOLD;
    ctx.font = fontStack("600 26px");
    ctx.fillText(input.formatHint, PAD, y);
    y += 36;
  }

  y += 16;
  ctx.strokeStyle = "rgba(184,240,0,0.22)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(W - PAD, y);
  ctx.stroke();
  y += 48;

  // Table header
  ctx.fillStyle = MUTE;
  ctx.font = fontStack("700 24px");
  ctx.fillText("VS ARCHETYPE", PAD, y);
  ctx.fillText("RECORD", W - PAD - 280, y);
  ctx.fillText("WR", W - PAD - 90, y);
  y += 28;
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(W - PAD, y);
  ctx.stroke();
  y += 44;

  const rowH = Math.min(
    64,
    Math.max(48, Math.floor((H - 140 - y) / Math.max(1, input.rows.length))),
  );

  for (const row of input.rows) {
    if (y + rowH > H - 120) break;
    const rate =
      row.rate != null
        ? Math.round(row.rate * 100)
        : row.wins + row.losses
          ? Math.round((row.wins / (row.wins + row.losses)) * 100)
          : null;

    ctx.fillStyle = INK;
    ctx.font = fontStack("600 32px");
    ctx.fillText(ellipsize(ctx, row.archetype, W - PAD * 2 - 320), PAD, y);

    ctx.fillStyle = MUTE;
    ctx.font = fontStack("600 30px");
    const rec = `${row.wins}–${row.losses}`;
    ctx.fillText(rec, W - PAD - 280, y);

    ctx.fillStyle =
      rate == null ? MUTE : rate >= 55 ? "#34d399" : rate <= 45 ? "#f87171" : GOLD;
    ctx.font = fontStack("700 30px");
    const wrText = rate == null ? "—" : `${rate}%`;
    ctx.fillText(wrText, W - PAD - 90, y);

    y += rowH;
  }

  ctx.fillStyle = FAINT;
  ctx.font = fontStack("400 23px");
  ctx.fillText(
    "filthy-net-deck.com · Built by ApexForge",
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

export function matchupShareFilename(deckName: string): string {
  return `filthy-net-deck-matchups-${slugify(deckName)}.png`;
}
