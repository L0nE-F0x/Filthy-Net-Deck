/**
 * Share card for a single Matchup Lab opponent record (A5 extension).
 * Canvas is browser-only on user share and styled by shareKit so every card
 * in the app shares one design system.
 */

import {
  BRAND,
  canvasToPng,
  chip,
  drawFooter,
  drawHeader,
  drawTracked,
  ellipsize,
  fillRoundRect,
  font,
  loadBrandLogo,
  makeCanvas,
  paintBackdrop,
  panel,
  statTile,
  strokeRoundRect,
  withAlpha,
  wrapLines,
  wrRing,
} from "./shareKit";

export interface OpponentShareInput {
  opponentName: string;
  wins: number;
  losses: number;
  form?: string;
  tag?: string | null;
  decks?: string[];
}

export function opponentShareCaption(input: OpponentShareInput): string {
  const bits = [
    `vs ${input.opponentName}: ${input.wins}–${input.losses}`,
    input.tag ? `tag ${input.tag}` : null,
    input.form ? `form ${input.form}` : null,
    `Matchup Lab · Filthy Net Deck`,
    "https://filthy-net-deck.com/#download",
  ].filter(Boolean);
  return bits.join(" · ");
}

/** Small W/L square for the recent-form strip. */
function formChip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  letter: string,
): number {
  const s = 40;
  const up = letter.toUpperCase();
  const color = up === "W" ? BRAND.win : up === "L" ? BRAND.loss : BRAND.mute;
  fillRoundRect(ctx, x, y, s, s, 10, withAlpha(color, 0.16));
  strokeRoundRect(ctx, x, y, s, s, 10, withAlpha(color, 0.55), 1.5);
  ctx.fillStyle = color;
  ctx.font = font("800 22px");
  const tw = ctx.measureText(up).width;
  ctx.fillText(up, x + (s - tw) / 2, y + s / 2 + 8);
  return s;
}

/** 1080×1080 opponent record card. */
export async function renderOpponentSharePng(
  input: OpponentShareInput,
): Promise<Blob> {
  const size = 1080;
  const PAD = 64;
  const { canvas, ctx } = makeCanvas(size, size);

  paintBackdrop(ctx, size, size);
  const logo = await loadBrandLogo();
  let y = drawHeader(ctx, size, {
    kicker: "Matchup Lab · local record",
    logo,
  });
  y += 36;

  // VS kicker + opponent hero.
  ctx.fillStyle = BRAND.mute;
  ctx.font = font("600 20px");
  drawTracked(ctx, "VS OPPONENT", PAD, y, 3);
  y += 38;

  const name = input.opponentName || "Opponent";
  let namePx = 64;
  let nameLines: string[] = [];
  while (namePx > 36) {
    ctx.font = font(`800 ${namePx}px`);
    nameLines = wrapLines(ctx, name, size - PAD * 2);
    if (nameLines.length <= 2) break;
    namePx -= 2;
  }
  ctx.font = font(`800 ${namePx}px`);
  ctx.fillStyle = BRAND.lime;
  for (const l of nameLines.slice(0, 2)) {
    ctx.fillText(ellipsize(ctx, l, size - PAD * 2), PAD, y + namePx * 0.82);
    y += namePx * 1.1;
  }
  y += 30;

  if (input.tag) {
    chip(ctx, PAD, y, input.tag, BRAND.gold, 22);
    y += 66;
  }

  // Stat band: record tile + WR ring.
  y += 22;
  const decided = input.wins + input.losses;
  const wr = decided ? Math.round((input.wins / decided) * 100) : null;
  const bandH = 240;
  const ringW = 320;
  const tileW = size - PAD * 2 - ringW - 20;
  statTile(ctx, PAD, y, tileW, bandH, {
    label: "Your record",
    value: `${input.wins}–${input.losses}`,
    sub: decided ? `${decided} decided matches` : "No decided matches yet",
  });
  panel(ctx, PAD + tileW + 20, y, ringW, bandH, 22);
  wrRing(ctx, PAD + tileW + 20 + ringW / 2, y + bandH / 2 + 4, 86, wr);
  y += bandH + 56;

  // Recent form strip (oldest → newest).
  if (input.form) {
    ctx.fillStyle = BRAND.mute;
    ctx.font = font("600 19px");
    drawTracked(ctx, "RECENT FORM", PAD, y + 12, 2.5);
    let fx = PAD + 170;
    for (const ch of input.form.slice(-5)) {
      fx += formChip(ctx, fx, y - 16, ch) + 12;
    }
  }

  // Your decks line, anchored above the footer.
  if (input.decks?.length) {
    ctx.fillStyle = BRAND.mute;
    ctx.font = font("500 25px");
    ctx.fillText(
      ellipsize(
        ctx,
        `Your decks: ${input.decks.slice(0, 3).join(", ")}`,
        size - PAD * 2,
      ),
      PAD,
      size - 150,
    );
  }

  drawFooter(ctx, size, size, PAD);
  return canvasToPng(canvas);
}
