/**
 * Brand share cards (PNG) for Climb season story and Planeswalker themes.
 * Canvas-only — no network; safe for local export. Styled by shareKit so
 * every card in the app shares one design system.
 */

import type { TrackedMatch } from "../types/tracker";
import { SKINS, type SkinId } from "./theme";
import { currentStreak, deckClimbSummaries, longestStreak } from "./climbStats";
import { seasonKeyOf, seasonLabel, currentSeasonKey } from "./tracker";
import { formatRank, parseRank } from "./ranks";
import {
  BRAND,
  canvasToPng,
  downloadBlob,
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
  pill,
  ratioBar,
  sparkline,
  statTile,
  strokeRoundRect,
  wrapLines,
} from "./shareKit";

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
        ? "This season's climb"
        : seasonLabel(seasonKey);

  const size = 1080;
  const PAD = 64;
  const { canvas, ctx } = makeCanvas(size, size);

  paintBackdrop(ctx, size, size);
  const logo = await loadBrandLogo();
  let y = drawHeader(ctx, size, {
    kicker: "Climb story · local only",
    logo,
  });
  y += 28;

  // Title hero.
  ctx.fillStyle = BRAND.lime;
  ctx.font = font("800 54px");
  ctx.fillText(ellipsize(ctx, title, size - PAD * 2), PAD, y + 42);
  y += 96;

  // Rank path sparkline (needs at least two ranked finishes).
  if (ranked.length >= 2) {
    const ph = 236;
    panel(ctx, PAD, y, size - PAD * 2, ph, 22);
    ctx.fillStyle = BRAND.mute;
    ctx.font = font("600 18px");
    drawTracked(ctx, "RANK PATH", PAD + 28, y + 42, 2.5);
    if (current) {
      ctx.fillStyle = BRAND.ink;
      ctx.font = font("800 30px");
      const cur = formatRank(current);
      ctx.fillText(cur, size - PAD - 28 - ctx.measureText(cur).width, y + 44);
    }
    sparkline(
      ctx,
      PAD + 28,
      y + 66,
      size - PAD * 2 - 56,
      ph - 124,
      ranked.map((r) => r.rank.score),
      BRAND.lime,
      true,
    );
    // Start / peak captions under the line.
    ctx.fillStyle = BRAND.mute;
    ctx.font = font("500 20px");
    ctx.fillText(formatRank(ranked[0].rank), PAD + 28, y + ph - 24);
    if (peak) {
      const p = `Peak ${formatRank(peak)}`;
      ctx.fillStyle = BRAND.gold;
      ctx.fillText(p, size - PAD - 28 - ctx.measureText(p).width, y + ph - 24);
    }
    y += ph + 34;
  }

  // Stat tiles.
  const tileW = (size - PAD * 2 - 2 * 20) / 3;
  const bandH = 168;
  statTile(ctx, PAD, y, tileW, bandH, {
    label: "Record",
    value: wr != null ? `${wins}–${losses} · ${wr}%` : `${wins}–${losses}`,
    sub: `${seasonMatches.length} games`,
  });
  statTile(ctx, PAD + tileW + 20, y, tileW, bandH, {
    label: "Streak",
    value:
      streak.type && streak.length > 0
        ? `${streak.type === "win" ? "W" : "L"} ×${streak.length}`
        : "—",
    sub: `best win run ${bestWin}`,
    color:
      streak.type === "win"
        ? BRAND.win
        : streak.type === "loss"
          ? BRAND.loss
          : BRAND.ink,
  });
  statTile(ctx, PAD + (tileW + 20) * 2, y, tileW, bandH, {
    label: current ? "Rank now" : "Window",
    value: current
      ? formatRank(current)
      : seasonKey === "all"
        ? "All-time"
        : "Season",
    sub:
      peak && (!current || formatRank(peak) !== formatRank(current))
        ? `Peak ${formatRank(peak)}`
        : null,
  });
  y += bandH + 36;

  // Path by deck.
  if (decks.length) {
    const rowsBottom = size - 118;
    const ph = Math.max(120, rowsBottom - y);
    panel(ctx, PAD, y, size - PAD * 2, ph, 22);
    ctx.fillStyle = BRAND.mute;
    ctx.font = font("600 18px");
    drawTracked(ctx, "PATH BY DECK", PAD + 28, y + 42, 2.5);

    const rowH = Math.min(62, Math.floor((ph - 64) / decks.length));
    let ry = y + 58;
    for (const d of decks) {
      const dDecided = d.wins + d.losses;
      const pct = dDecided ? Math.round((d.wins / dDecided) * 100) : null;
      const base = ry + Math.round(rowH * 0.55);

      ctx.fillStyle = BRAND.ink;
      ctx.font = font("600 28px");
      ctx.fillText(ellipsize(ctx, d.name, size - PAD * 2 - 320), PAD + 28, base);

      ctx.font = font("600 26px");
      ctx.fillStyle = BRAND.mute;
      const rec = `${d.wins}–${d.losses}`;
      ctx.fillText(rec, size - PAD - 160 - ctx.measureText(rec).width, base);

      if (pct != null) {
        const color = pct >= 55 ? BRAND.win : pct <= 45 ? BRAND.loss : BRAND.gold;
        ctx.font = font("800 26px");
        const pctLabel = `${pct}%`;
        ctx.fillStyle = color;
        ctx.fillText(pctLabel, size - PAD - 28 - ctx.measureText(pctLabel).width, base);
        ratioBar(ctx, PAD + 28, base + 12, size - PAD * 2 - 56, 6, pct / 100, color);
      }
      ry += rowH;
    }
  }

  drawFooter(ctx, size, size, PAD);
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
  const PAD = 64;
  const { canvas, ctx } = makeCanvas(size, size);

  paintBackdrop(ctx, size, size, { accent, accent2: bright, baseInk: ink });
  const logo = await loadBrandLogo();
  let y = drawHeader(ctx, size, {
    kicker: "Planeswalker theme",
    accent,
    logo,
  });
  y += 70;

  // Skin name hero.
  ctx.fillStyle = bright;
  ctx.font = font("900 92px");
  ctx.fillText(ellipsize(ctx, skin.name, size - PAD * 2), PAD, y + 72);
  y += 136;

  ctx.fillStyle = accent;
  ctx.font = font("700 32px");
  ctx.fillText(ellipsize(ctx, skin.walker, size - PAD * 2), PAD, y + 30);
  y += 80;

  ctx.fillStyle = BRAND.mute;
  ctx.font = font("500 27px");
  for (const l of wrapLines(ctx, skin.blurb, size - PAD * 2).slice(0, 2)) {
    ctx.fillText(l, PAD, y + 24);
    y += 42;
  }
  y += 72;

  // Swatch tiles with hex labels.
  const sw = 140;
  let sx = PAD;
  for (const c of skin.swatches) {
    fillRoundRect(ctx, sx, y, sw, sw, 24, c);
    strokeRoundRect(ctx, sx, y, sw, sw, 24, "rgba(255,255,255,0.28)", 2);
    ctx.fillStyle = BRAND.mute;
    ctx.font = font("600 19px");
    ctx.fillText(c.toUpperCase(), sx, y + sw + 36);
    sx += sw + 40;
  }
  y += sw + 86;

  ctx.fillStyle = BRAND.mute;
  ctx.font = font("500 24px");
  ctx.fillText("Sidebar → Themes · Dark & Light still stack", PAD, y);
  y += 56;

  pill(ctx, PAD, y, "Free · Windows + macOS", accent, 24);

  drawFooter(ctx, size, size, PAD, accent);
  return canvasToPng(canvas);
}

export async function downloadThemeSharePng(skinId: SkinId): Promise<void> {
  const blob = await renderThemeSharePng(skinId);
  downloadBlob(blob, `filthy-net-deck-theme-${skinId}.png`);
}
