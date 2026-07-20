/**
 * Render a local shareable recap PNG from RecapStats (canvas in the browser).
 */

import {
  buildRecapStats,
  formatRecapHeadline,
  lastSevenDaysWindow,
  type RecapStats,
} from "./recapStats";
import type { TrackedMatch } from "../types/tracker";

export function recapFromMatches(
  matches: TrackedMatch[],
  nowMs = Date.now(),
): RecapStats {
  const { fromMs, toMs } = lastSevenDaysWindow(nowMs);
  return buildRecapStats(matches, fromMs, toMs);
}

/** Draw a 1080×1080 branded recap card; returns a PNG blob. */
export async function renderRecapPng(stats: RecapStats): Promise<Blob> {
  const size = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");

  // Background
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, "#0a0f0c");
  grad.addColorStop(0.5, "#121a14");
  grad.addColorStop(1, "#0c1410");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Gold accent bar
  ctx.fillStyle = "#c9a227";
  ctx.fillRect(0, 0, size, 12);

  ctx.fillStyle = "#e8f0e9";
  ctx.font = "600 42px system-ui, Segoe UI, sans-serif";
  ctx.fillText("Filthy Net Deck", 64, 100);

  ctx.fillStyle = "#8fa396";
  ctx.font = "400 28px system-ui, Segoe UI, sans-serif";
  ctx.fillText("Weekly recap · local only", 64, 150);

  const headline = formatRecapHeadline(stats);
  ctx.fillStyle = "#f4f7f4";
  ctx.font = "700 56px system-ui, Segoe UI, sans-serif";
  wrapText(ctx, headline, 64, 280, size - 128, 68);

  let y = 420;
  ctx.fillStyle = "#c9a227";
  ctx.font = "600 32px system-ui, Segoe UI, sans-serif";
  if (stats.rankDeltaLabel) {
    ctx.fillText(stats.rankDeltaLabel, 64, y);
    y += 64;
  }

  if (stats.bestDeck) {
    ctx.fillStyle = "#8fa396";
    ctx.font = "400 26px system-ui, Segoe UI, sans-serif";
    ctx.fillText("Best deck", 64, y);
    y += 44;
    ctx.fillStyle = "#e8f0e9";
    ctx.font = "600 36px system-ui, Segoe UI, sans-serif";
    const pct = Math.round(stats.bestDeck.winrate * 100);
    ctx.fillText(
      `${stats.bestDeck.name} · ${pct}% (${stats.bestDeck.wins}–${stats.bestDeck.losses})`,
      64,
      y,
    );
  }

  ctx.fillStyle = "#5a6b5e";
  ctx.font = "400 24px system-ui, Segoe UI, sans-serif";
  ctx.fillText("filthy-net-deck.com · Built by ApexForge", 64, size - 64);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("PNG encode failed"))),
      "image/png",
    );
  });
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(" ");
  let line = "";
  let cy = y;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      line = w;
      cy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
}

/** Trigger a browser download of the recap PNG. */
export async function downloadRecapPng(
  matches: TrackedMatch[],
  filename = "filthy-net-deck-recap.png",
): Promise<void> {
  const stats = recapFromMatches(matches);
  const blob = await renderRecapPng(stats);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
