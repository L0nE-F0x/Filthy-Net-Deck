/**
 * Render a local shareable recap PNG from RecapStats (canvas in the browser).
 * Styled by shareKit so every card in the app shares one design system.
 */

import {
  buildRecapStats,
  formatRecapHeadline,
  lastSevenDaysWindow,
  type RecapStats,
} from "./recapStats";
import type { TrackedMatch } from "../types/tracker";
import {
  BRAND,
  canvasToPng,
  chip,
  downloadBlob,
  drawFooter,
  drawHeader,
  drawTracked,
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

export function recapFromMatches(
  matches: TrackedMatch[],
  nowMs = Date.now(),
): RecapStats {
  const { fromMs, toMs } = lastSevenDaysWindow(nowMs);
  return buildRecapStats(matches, fromMs, toMs);
}

export interface RecapCardOptions {
  /** Small uppercase line under the wordmark. */
  kicker?: string;
}

/** Draw a 1080×1080 branded recap card; returns a PNG blob. */
export async function renderRecapPng(
  stats: RecapStats,
  opts?: RecapCardOptions,
): Promise<Blob> {
  const size = 1080;
  const PAD = 64;
  const { canvas, ctx } = makeCanvas(size, size);

  paintBackdrop(ctx, size, size);
  const logo = await loadBrandLogo();
  let y = drawHeader(ctx, size, {
    kicker: opts?.kicker ?? "Local recap · tracked on this PC",
    logo,
  });
  y += 44;

  // Headline hero.
  const headline = formatRecapHeadline(stats);
  ctx.fillStyle = BRAND.lime;
  ctx.font = font("800 56px");
  const headLines: string[] = [];
  {
    const words = headline.split(" ");
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > size - PAD * 2 && line) {
        headLines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) headLines.push(line);
  }
  for (const l of headLines.slice(0, 2)) {
    ctx.fillText(ellipsize(ctx, l, size - PAD * 2), PAD, y + 46);
    y += 66;
  }
  y += 76;

  // Rank movement chip.
  if (stats.rankDeltaLabel) {
    chip(ctx, PAD, y - 12, stats.rankDeltaLabel, BRAND.gold, 22);
    y += 56;
  }

  // Stat band: WR ring + record + games.
  const decided = stats.wins + stats.losses;
  const wr = decided ? Math.round(stats.winrate * 100) : null;
  const bandH = 210;
  const ringW = 280;
  panel(ctx, PAD, y, ringW, bandH, 22);
  wrRing(ctx, PAD + ringW / 2, y + bandH / 2 + 4, 74, wr);
  const tileW = (size - PAD * 2 - ringW - 2 * 20) / 2;
  statTile(ctx, PAD + ringW + 20, y, tileW, bandH, {
    label: "Record",
    value: `${stats.wins}–${stats.losses}`,
    sub: stats.draws > 0 ? `+${stats.draws} draws` : null,
  });
  statTile(ctx, PAD + ringW + 20 + tileW + 20, y, tileW, bandH, {
    label: "Games",
    value: String(stats.games),
    sub:
      stats.startRank && stats.endRank
        ? `${stats.startRank} → ${stats.endRank}`
        : null,
  });
  y += bandH + 48;

  // Best deck panel with WR bar.
  if (stats.bestDeck) {
    const d = stats.bestDeck;
    const pct = Math.round(d.winrate * 100);
    const ph = 160;
    panel(ctx, PAD, y, size - PAD * 2, ph, 20);
    ctx.fillStyle = BRAND.mute;
    ctx.font = font("600 18px");
    drawTracked(ctx, "BEST DECK", PAD + 28, y + 46, 2.5);

    // Right-aligned "W–L · NN%" readout.
    const pctColor = pct >= 55 ? BRAND.win : pct <= 45 ? BRAND.loss : BRAND.gold;
    ctx.font = font("800 34px");
    const pctLabel = `${pct}%`;
    const pctW = ctx.measureText(pctLabel).width;
    ctx.fillStyle = pctColor;
    ctx.fillText(pctLabel, size - PAD - 28 - pctW, y + 100);
    ctx.font = font("600 26px");
    const recLabel = `${d.wins}–${d.losses} · `;
    const recW = ctx.measureText(recLabel).width;
    ctx.fillStyle = BRAND.mute;
    ctx.fillText(recLabel, size - PAD - 28 - pctW - recW, y + 100);

    ctx.fillStyle = BRAND.ink;
    ctx.font = font("700 34px");
    const nameMax = size - PAD * 2 - 56 - pctW - recW - 32;
    ctx.fillText(ellipsize(ctx, d.name, nameMax), PAD + 28, y + 100);

    ratioBar(ctx, PAD + 28, y + ph - 32, size - PAD * 2 - 56, 8, d.winrate, BRAND.lime);
  }

  drawFooter(ctx, size, size, PAD);
  return canvasToPng(canvas);
}

/** Trigger a browser download of the recap PNG. */
export async function downloadRecapPng(
  matches: TrackedMatch[],
  filename = "filthy-net-deck-recap.png",
  opts?: RecapCardOptions,
): Promise<void> {
  const stats = recapFromMatches(matches);
  const blob = await renderRecapPng(stats, opts);
  downloadBlob(blob, filename);
}
