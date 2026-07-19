/**
 * Brand share cards (PNG) for Climb season story and Planeswalker themes.
 * Canvas-only — no network; safe for local export.
 */

import type { TrackedMatch } from "../types/tracker";
import { SKINS, type SkinId } from "./theme";
import { currentStreak, deckClimbSummaries, longestStreak } from "./climbStats";
import { seasonKeyOf, seasonLabel, currentSeasonKey } from "./tracker";
import { formatRank, parseRank } from "./ranks";

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
  return cy;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("PNG encode failed"))),
      "image/png",
    );
  });
}

export interface ClimbShareInput {
  matches: TrackedMatch[];
  /** "all" or "YYYY-MM" */
  seasonKey: string;
}

/** 1080×1080 climb story card for the selected season. */
export async function renderClimbSharePng(input: ClimbShareInput): Promise<Blob> {
  const { matches, seasonKey } = input;
  const seasonMatches =
    seasonKey === "all"
      ? matches
      : matches.filter((m) => seasonKeyOf(m.endedAt) === seasonKey);

  const wins = seasonMatches.filter((m) => m.result === "win").length;
  const losses = seasonMatches.filter((m) => m.result === "loss").length;
  const decided = wins + losses;
  const wr = decided ? Math.round((wins / decided) * 100) : null;
  const streak = currentStreak(seasonMatches);
  const bestWin = longestStreak(seasonMatches, "win");
  const decks = deckClimbSummaries(seasonMatches).slice(0, 3);
  const ranked = seasonMatches
    .map((m) => ({ at: m.endedAt, rank: parseRank(m.myRank) }))
    .filter((r): r is { at: number; rank: NonNullable<ReturnType<typeof parseRank>> } => r.rank != null)
    .sort((a, b) => a.at - b.at);
  const peak = ranked.length
    ? ranked.reduce((b, r) => (r.rank.score > b.rank.score ? r : b), ranked[0]).rank
    : null;
  const current = ranked.length ? ranked[ranked.length - 1].rank : null;
  const title =
    seasonKey === "all"
      ? "All-time climb"
      : seasonKey === currentSeasonKey()
        ? "This season’s climb"
        : seasonLabel(seasonKey);

  const size = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");

  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, "#050604");
  grad.addColorStop(0.55, "#0e140c");
  grad.addColorStop(1, "#0a1008");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = "#b8f000";
  ctx.fillRect(0, 0, size, 14);

  ctx.fillStyle = "#f2f4ea";
  ctx.font = "700 40px Segoe UI, system-ui, sans-serif";
  ctx.fillText("Filthy Net Deck", 64, 96);
  ctx.fillStyle = "#9aa38a";
  ctx.font = "500 26px Segoe UI, system-ui, sans-serif";
  ctx.fillText("Climb story · local only", 64, 142);

  ctx.fillStyle = "#b8f000";
  ctx.font = "800 52px Segoe UI, system-ui, sans-serif";
  ctx.fillText(title, 64, 230);

  let y = 310;
  ctx.fillStyle = "#f2f4ea";
  ctx.font = "700 44px Segoe UI, system-ui, sans-serif";
  const line1 =
    wr != null
      ? `${wins}–${losses} · ${wr}% WR · ${seasonMatches.length} games`
      : `${seasonMatches.length} games recorded`;
  ctx.fillText(line1, 64, y);
  y += 70;

  if (peak || current) {
    ctx.fillStyle = "#e8c56a";
    ctx.font = "600 32px Segoe UI, system-ui, sans-serif";
    const bits = [
      current ? `Now ${formatRank(current)}` : null,
      peak ? `Peak ${formatRank(peak)}` : null,
    ].filter(Boolean);
    ctx.fillText(bits.join("  ·  "), 64, y);
    y += 64;
  }

  if (streak.type && streak.length > 0) {
    ctx.fillStyle = streak.type === "win" ? "#34d399" : "#f87171";
    ctx.font = "600 30px Segoe UI, system-ui, sans-serif";
    ctx.fillText(
      `Current ${streak.type} streak ×${streak.length} · best win run ${bestWin}`,
      64,
      y,
    );
    y += 60;
  }

  if (decks.length) {
    ctx.fillStyle = "#9aa38a";
    ctx.font = "500 24px Segoe UI, system-ui, sans-serif";
    ctx.fillText("Path by deck", 64, y);
    y += 44;
    ctx.fillStyle = "#f2f4ea";
    ctx.font = "600 30px Segoe UI, system-ui, sans-serif";
    for (const d of decks) {
      const decided = d.wins + d.losses;
      const pct = decided ? Math.round((d.wins / decided) * 100) : null;
      const line =
        pct != null ? `${d.name} · ${pct}% (${d.wins}–${d.losses})` : d.name;
      ctx.fillText(line, 64, y);
      y += 42;
    }
  }

  ctx.fillStyle = "#5a6b5e";
  ctx.font = "400 22px Segoe UI, system-ui, sans-serif";
  ctx.fillText("filthy-net-deck.netlify.app · Built by ApexForge", 64, size - 56);

  return canvasToPng(canvas);
}

export async function downloadClimbSharePng(
  matches: TrackedMatch[],
  seasonKey: string,
  filename?: string,
): Promise<void> {
  const blob = await renderClimbSharePng({ matches, seasonKey });
  const slug =
    seasonKey === "all" ? "all-time" : seasonKey === currentSeasonKey() ? "this-season" : seasonKey;
  downloadBlob(blob, filename ?? `filthy-net-deck-climb-${slug}.png`);
}

/** Theme skin marketing card — exact palette from SKINS, no fake UI. */
export async function renderThemeSharePng(skinId: SkinId): Promise<Blob> {
  const skin = SKINS.find((s) => s.id === skinId) ?? SKINS[0];
  const [ink, accent, bright] = skin.swatches;
  const size = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");

  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, ink);
  grad.addColorStop(0.6, "#0a0c08");
  grad.addColorStop(1, "#050604");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Accent glow orb
  const orb = ctx.createRadialGradient(size * 0.7, size * 0.35, 20, size * 0.7, size * 0.35, 420);
  orb.addColorStop(0, `${accent}99`);
  orb.addColorStop(1, `${accent}00`);
  ctx.fillStyle = orb;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, size, 14);

  ctx.fillStyle = bright;
  ctx.font = "700 36px Segoe UI, system-ui, sans-serif";
  ctx.fillText("Filthy Net Deck", 64, 100);
  ctx.fillStyle = accent;
  ctx.font = "800 28px Segoe UI, system-ui, sans-serif";
  ctx.fillText("PLANESWALKER THEME", 64, 150);

  ctx.fillStyle = bright;
  ctx.font = "900 96px Segoe UI, system-ui, sans-serif";
  ctx.fillText(skin.name, 64, 320);

  ctx.fillStyle = accent;
  ctx.font = "700 32px Segoe UI, system-ui, sans-serif";
  ctx.fillText(skin.walker, 64, 390);

  ctx.fillStyle = "#9aa38a";
  ctx.font = "500 28px Segoe UI, system-ui, sans-serif";
  wrapText(ctx, skin.blurb, 64, 460, size - 128, 40);

  // Swatches
  const swY = 620;
  skin.swatches.forEach((c, i) => {
    const x = 64 + i * 120;
    ctx.fillStyle = c;
    // Rounded rect without roundRect (broader canvas support)
    const r = 16;
    const w = 96;
    const h = 96;
    ctx.beginPath();
    ctx.moveTo(x + r, swY);
    ctx.arcTo(x + w, swY, x + w, swY + h, r);
    ctx.arcTo(x + w, swY + h, x, swY + h, r);
    ctx.arcTo(x, swY + h, x, swY, r);
    ctx.arcTo(x, swY, x + w, swY, r);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(242,244,234,0.35)";
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  ctx.fillStyle = "#9aa38a";
  ctx.font = "500 26px Segoe UI, system-ui, sans-serif";
  ctx.fillText("Sidebar → Themes · Dark & Light still stack", 64, 780);

  ctx.fillStyle = accent;
  ctx.font = "700 28px Segoe UI, system-ui, sans-serif";
  ctx.fillText("Free · Windows + macOS", 64, 860);

  ctx.fillStyle = "#5a6b5e";
  ctx.font = "400 22px Segoe UI, system-ui, sans-serif";
  ctx.fillText("filthy-net-deck.netlify.app · Built by ApexForge", 64, size - 56);

  return canvasToPng(canvas);
}

export async function downloadThemeSharePng(skinId: SkinId): Promise<void> {
  const blob = await renderThemeSharePng(skinId);
  downloadBlob(blob, `filthy-net-deck-theme-${skinId}.png`);
}

