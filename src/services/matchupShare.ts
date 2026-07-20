/**
 * A5 — personal matchup share card.
 * Renders a branded PNG from B1/B2 matchup rows (real cards seen → archetypes).
 * Aggregation stays pure; canvas is browser-only on user share and styled by
 * shareKit so every card in the app shares one design system.
 */

import type { DeckMatchupRow } from "./gameAnalytics";
import { matchupCaption } from "./communityShare";
import {
  BRAND,
  canvasToPng,
  drawFooter,
  drawHeader,
  ellipsize,
  font,
  loadBrandLogo,
  makeCanvas,
  paintBackdrop,
  panel,
  ratioBar,
  statTile,
  wrRing,
} from "./shareKit";

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

function wrColor(rate: number | null): string {
  if (rate == null) return BRAND.mute;
  return rate >= 55 ? BRAND.win : rate <= 45 ? BRAND.loss : BRAND.gold;
}

/** 1080×1350 matchup matrix card — personal WR by inferred archetype. */
export async function renderMatchupSharePng(
  input: MatchupShareInput,
): Promise<Blob> {
  const W = 1080;
  const H = 1350;
  const PAD = 64;
  const { canvas, ctx } = makeCanvas(W, H);

  paintBackdrop(ctx, W, H);
  const logo = await loadBrandLogo();
  let y = drawHeader(ctx, W, {
    kicker: "Personal matchups · cards actually seen",
    logo,
  });
  y += 26;

  // Hero: deck name.
  ctx.fillStyle = BRAND.lime;
  ctx.font = font("800 56px");
  ctx.fillText(ellipsize(ctx, input.deckName, W - PAD * 2), PAD, y + 44);
  if (input.formatHint) {
    ctx.fillStyle = BRAND.mute;
    ctx.font = font("600 20px");
    ctx.fillText(input.formatHint.toUpperCase(), PAD + 2, y + 84);
    y += 42;
  }
  y += 108;

  // Stat band: overall WR ring + record + sample size.
  const decided = input.wins + input.losses;
  const wr = decided ? Math.round((input.wins / decided) * 100) : null;
  const bandH = 190;
  const ringW = 280;
  panel(ctx, PAD, y, ringW, bandH, 22);
  wrRing(ctx, PAD + ringW / 2, y + bandH / 2 + 4, 70, wr);
  const tileW = (W - PAD * 2 - ringW - 2 * 20) / 2;
  statTile(ctx, PAD + ringW + 20, y, tileW, bandH, {
    label: "Overall record",
    value: `${input.wins}–${input.losses}`,
    sub: decided ? `${decided} decided matches` : "No decided matches",
  });
  statTile(ctx, PAD + ringW + 20 + tileW + 20, y, tileW, bandH, {
    label: "Archetypes faced",
    value: String(input.rows.length),
    sub: "inferred from cards seen",
  });
  y += bandH + 40;

  // Matchup table inside a panel.
  const tableTop = y;
  const tableBottom = H - 118;
  panel(ctx, PAD, tableTop, W - PAD * 2, tableBottom - tableTop, 22);
  const ix = PAD + 30;
  const iw = W - PAD * 2 - 60;

  // Table header.
  ctx.fillStyle = BRAND.mute;
  ctx.font = font("700 19px");
  const hy = tableTop + 48;
  ctx.fillText("VS ARCHETYPE", ix, hy);
  ctx.fillText("RECORD", ix + iw - 268, hy);
  ctx.fillText("WR", ix + iw - ctx.measureText("WR").width, hy);
  ctx.strokeStyle = BRAND.hairline;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ix, hy + 18);
  ctx.lineTo(ix + iw, hy + 18);
  ctx.stroke();

  const rowsTop = hy + 34;
  const rowsBottom = tableBottom - 24;
  const rowH = Math.min(
    96,
    Math.max(46, Math.floor((rowsBottom - rowsTop) / Math.max(1, input.rows.length))),
  );

  let ry = rowsTop;
  for (const row of input.rows) {
    if (ry + rowH > rowsBottom + 8) break;
    const rate =
      row.rate != null
        ? Math.round(row.rate * 100)
        : row.wins + row.losses
          ? Math.round((row.wins / (row.wins + row.losses)) * 100)
          : null;
    const base = ry + Math.round(rowH * 0.52);

    ctx.fillStyle = BRAND.ink;
    ctx.font = font("600 30px");
    ctx.fillText(ellipsize(ctx, row.archetype, iw - 320), ix, base);

    ctx.fillStyle = BRAND.mute;
    ctx.font = font("600 28px");
    ctx.fillText(`${row.wins}–${row.losses}`, ix + iw - 268, base);

    ctx.fillStyle = wrColor(rate);
    ctx.font = font("800 28px");
    const wrText = rate == null ? "—" : `${rate}%`;
    ctx.fillText(wrText, ix + iw - ctx.measureText(wrText).width, base);

    // WR ratio bar under the row.
    if (rate != null) {
      ratioBar(ctx, ix, base + 14, iw, 6, rate / 100, wrColor(rate));
    }
    ry += rowH;
  }

  drawFooter(ctx, W, H, PAD);
  return canvasToPng(canvas);
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
