/**
 * Share card for a single Matchup Lab opponent record (A5 extension).
 */

export interface OpponentShareInput {
  opponentName: string;
  wins: number;
  losses: number;
  form?: string;
  tag?: string | null;
  decks?: string[];
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

function loadLogo(): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = "/app-icon.png";
  });
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

/** 1080×1080 opponent record card. */
export async function renderOpponentSharePng(
  input: OpponentShareInput,
): Promise<Blob> {
  const size = 1080;
  const PAD = 64;
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
  ctx.fillStyle = LIME;
  ctx.fillRect(0, 0, size, 14);

  const logo = await loadLogo();
  ctx.fillStyle = INK;
  ctx.font = fontStack("700 40px");
  ctx.fillText("Filthy Net Deck", PAD, 96);
  ctx.fillStyle = MUTE;
  ctx.font = fontStack("500 26px");
  ctx.fillText("Matchup Lab · local record", PAD, 142);
  if (logo) {
    ctx.drawImage(logo, size - PAD - 84, 44, 84, 84);
  }

  let y = 280;
  ctx.fillStyle = MUTE;
  ctx.font = fontStack("600 28px");
  ctx.fillText("VS", PAD, y);
  y += 70;
  ctx.fillStyle = LIME;
  ctx.font = fontStack("800 64px");
  ctx.fillText(ellipsize(ctx, input.opponentName || "Opponent", size - PAD * 2), PAD, y);
  y += 90;

  if (input.tag) {
    ctx.fillStyle = GOLD;
    ctx.font = fontStack("600 30px");
    ctx.fillText(ellipsize(ctx, input.tag, size - PAD * 2), PAD, y);
    y += 50;
  }

  const decided = input.wins + input.losses;
  const wr = decided ? Math.round((input.wins / decided) * 100) : null;
  ctx.fillStyle = INK;
  ctx.font = fontStack("700 52px");
  ctx.fillText(
    wr != null
      ? `${input.wins}–${input.losses}  ·  ${wr}% WR`
      : `${input.wins}–${input.losses}`,
    PAD,
    y,
  );
  y += 70;

  if (input.form) {
    ctx.fillStyle = MUTE;
    ctx.font = fontStack("600 32px");
    ctx.fillText(`Form  ${input.form}`, PAD, y);
    y += 50;
  }

  if (input.decks?.length) {
    ctx.fillStyle = MUTE;
    ctx.font = fontStack("500 26px");
    ctx.fillText(
      ellipsize(ctx, `Your decks: ${input.decks.slice(0, 3).join(", ")}`, size - PAD * 2),
      PAD,
      y,
    );
  }

  ctx.fillStyle = FAINT;
  ctx.font = fontStack("400 22px");
  ctx.fillText("filthy-net-deck.com · Built by ApexForge", PAD, size - 56);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("PNG encode failed"))),
      "image/png",
    );
  });
}
