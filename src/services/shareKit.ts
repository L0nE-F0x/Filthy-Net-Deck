/**
 * shareKit — shared premium design system for every branded share card (PNG).
 *
 * One module owns the backdrop, header, footer, panels, gauges and type
 * helpers so all cards feel like the same product. Canvas-only, no network;
 * safe for local export. Compatible with WebView2 / WKWebView (no
 * ctx.roundRect, no ctx.letterSpacing — tracking is drawn manually).
 */

export const BRAND = {
  lime: "#b8f000",
  gold: "#e8c56a",
  ink: "#f2f4ea",
  paper: "#e9ecdf",
  mute: "#9aa38a",
  faint: "#5a6b5e",
  win: "#34d399",
  loss: "#f87171",
  draw: "#fbbf24",
  panel: "rgba(255,255,255,0.035)",
  panelEdge: "rgba(255,255,255,0.08)",
  hairline: "rgba(255,255,255,0.07)",
} as const;

export function font(spec: string): string {
  return `${spec} "Segoe UI", system-ui, sans-serif`;
}

export function makeCanvas(
  w: number,
  h: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");
  ctx.textBaseline = "alphabetic";
  return { canvas, ctx };
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("PNG encode failed"))),
      "image/png",
    );
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/* Logo                                                               */
/* ------------------------------------------------------------------ */

let logoPromise: Promise<HTMLImageElement | null> | null = null;

/** Load the FND mark once; null when it can't load. */
export function loadBrandLogo(): Promise<HTMLImageElement | null> {
  if (!logoPromise) {
    logoPromise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = "/app-icon.png"; // Vite serves public/ at the web root.
    });
  }
  return logoPromise;
}

/* ------------------------------------------------------------------ */
/* Primitives                                                         */
/* ------------------------------------------------------------------ */

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string | CanvasGradient,
): void {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}

export function strokeRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  stroke: string,
  lineWidth = 1,
): void {
  roundRect(ctx, x, y, w, h, r);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

/** #rrggbb → rgba() string (other formats pass through untouched). */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function ellipsize(
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

/** Split into lines that fit maxWidth. Hard-wraps single long words. */
export function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      out.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) out.push(line);
  return out.map((l) => ellipsize(ctx, l, maxWidth));
}

/** Shrink font size until text fits maxWidth (returns the size to use). */
export function fitSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  weight: number,
  startPx: number,
  minPx: number,
): number {
  let px = startPx;
  while (px > minPx) {
    ctx.font = font(`${weight} ${px}px`);
    if (ctx.measureText(text).width <= maxWidth) return px;
    px -= 2;
  }
  return minPx;
}

/* ------------------------------------------------------------------ */
/* Tracked (letter-spaced) text — manual, works everywhere            */
/* ------------------------------------------------------------------ */

export function trackedWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  tracking: number,
): number {
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + tracking;
  return text.length ? w - tracking : 0;
}

/** Draw letter-spaced text left→right; returns the x after the last glyph. */
export function drawTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
): number {
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + tracking;
  }
  return text.length ? cx - tracking : x;
}

/* ------------------------------------------------------------------ */
/* Backdrop                                                           */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let noiseTile: HTMLCanvasElement | null = null;

/** Deterministic fine grain so cards don't look flat-rendered. */
function getNoiseTile(): HTMLCanvasElement {
  if (noiseTile) return noiseTile;
  const t = document.createElement("canvas");
  t.width = 160;
  t.height = 160;
  const c = t.getContext("2d");
  if (!c) return t;
  const rand = mulberry32(0xf1d1e5);
  const img = c.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(rand() * 255);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = Math.floor(rand() * 26); // very faint
  }
  c.putImageData(img, 0, 0);
  noiseTile = t;
  return t;
}

export interface BackdropOptions {
  /** Primary accent (glow top-right, top bar, frame). Default brand lime. */
  accent?: string;
  /** Secondary accent (glow bottom-left). Default gold. */
  accent2?: string;
  /** Optional ink wash to tint the base gradient (theme cards). */
  baseInk?: string;
  /** Draw the thin inner frame. Default true. */
  frame?: boolean;
}

/**
 * The premium backdrop every card shares: layered gradients, accent glows,
 * diagonal hairlines, film grain, vignette, top accent bar, inner frame.
 */
export function paintBackdrop(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  opts: BackdropOptions = {},
): void {
  const accent = opts.accent ?? BRAND.lime;
  const accent2 = opts.accent2 ?? BRAND.gold;

  // 1. Base
  const base = ctx.createLinearGradient(0, 0, w, h);
  base.addColorStop(0, "#070a06");
  base.addColorStop(0.55, "#0d130b");
  base.addColorStop(1, "#080e07");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  // 1b. Optional ink wash (skins tint the base toward their palette)
  if (opts.baseInk) {
    ctx.fillStyle = withAlpha(opts.baseInk, 0.55);
    ctx.fillRect(0, 0, w, h);
  }

  // 2. Accent glows
  let glow = ctx.createRadialGradient(
    w * 0.85,
    h * 0.06,
    0,
    w * 0.85,
    h * 0.06,
    w * 0.62,
  );
  glow.addColorStop(0, withAlpha(accent, 0.16));
  glow.addColorStop(1, withAlpha(accent, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  glow = ctx.createRadialGradient(
    w * 0.08,
    h * 0.98,
    0,
    w * 0.08,
    h * 0.98,
    w * 0.55,
  );
  glow.addColorStop(0, withAlpha(accent2, 0.09));
  glow.addColorStop(1, withAlpha(accent2, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  // 3. Diagonal hairlines
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.024)";
  ctx.lineWidth = 1;
  const step = 74;
  ctx.beginPath();
  for (let x = -h; x < w + h; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x + h, h);
  }
  ctx.stroke();
  ctx.restore();

  // 4. Film grain
  const pattern = ctx.createPattern(getNoiseTile(), "repeat");
  if (pattern) {
    ctx.save();
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // 5. Vignette
  const vig = ctx.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.36,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.78,
  );
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.34)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  // 6. Top accent bar with soft glow
  ctx.save();
  ctx.shadowColor = withAlpha(accent, 0.65);
  ctx.shadowBlur = 22;
  const bar = ctx.createLinearGradient(0, 0, w, 0);
  bar.addColorStop(0, accent);
  bar.addColorStop(0.6, withAlpha(accent, 0.85));
  bar.addColorStop(1, withAlpha(accent, 0.25));
  ctx.fillStyle = bar;
  ctx.fillRect(0, 0, w, 8);
  ctx.restore();

  // 7. Inner frame
  if (opts.frame !== false) {
    strokeRoundRect(ctx, 26, 26, w - 52, h - 52, 26, withAlpha(accent, 0.16), 2);
  }
}

/* ------------------------------------------------------------------ */
/* Header / footer                                                    */
/* ------------------------------------------------------------------ */

export interface HeaderOptions {
  /** Small uppercase line under the wordmark (tracked automatically). */
  kicker: string;
  accent?: string;
  logo?: HTMLImageElement | null;
  pad?: number;
}

/** Wordmark left + logo tile right; returns the y where content can start. */
export function drawHeader(
  ctx: CanvasRenderingContext2D,
  w: number,
  opts: HeaderOptions,
): number {
  const pad = opts.pad ?? 64;
  const accent = opts.accent ?? BRAND.lime;

  // Wordmark
  ctx.fillStyle = BRAND.ink;
  ctx.font = font("700 38px");
  ctx.fillText("Filthy Net Deck", pad, 92);

  // Kicker: accent diamond + tracked uppercase
  const ky = 132;
  ctx.save();
  ctx.translate(pad + 5, ky - 8);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = accent;
  ctx.fillRect(-5, -5, 10, 10);
  ctx.restore();
  ctx.fillStyle = BRAND.mute;
  ctx.font = font("600 20px");
  drawTracked(ctx, opts.kicker.toUpperCase(), pad + 22, ky, 3);

  // Logo tile
  if (opts.logo) {
    const s = 84;
    const lx = w - pad - s;
    const ly = 44;
    ctx.save();
    ctx.shadowColor = withAlpha(accent, 0.45);
    ctx.shadowBlur = 26;
    fillRoundRect(ctx, lx, ly, s, s, 20, "rgba(0,0,0,0.35)");
    ctx.restore();
    ctx.save();
    roundRect(ctx, lx, ly, s, s, 20);
    ctx.clip();
    ctx.drawImage(opts.logo, lx, ly, s, s);
    ctx.restore();
    strokeRoundRect(ctx, lx, ly, s, s, 20, withAlpha(accent, 0.4), 2);
  }

  return 178;
}

/** Brand footer: hairline + domain + ApexForge credit (kept every release). */
export function drawFooter(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  pad = 64,
  accent: string = BRAND.lime,
): void {
  ctx.strokeStyle = BRAND.hairline;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, h - 84);
  ctx.lineTo(w - pad, h - 84);
  ctx.stroke();

  ctx.font = font("500 21px");
  ctx.fillStyle = BRAND.faint;
  const x = drawTracked(ctx, "FILTHY-NET-DECK.COM", pad, h - 46, 1.5);
  ctx.save();
  ctx.translate(x + 18, h - 53);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.7;
  ctx.fillRect(-4, -4, 8, 8);
  ctx.restore();
  ctx.fillStyle = BRAND.faint;
  drawTracked(ctx, "BUILT BY APEXFORGE", x + 34, h - 46, 1.5);
}

/* ------------------------------------------------------------------ */
/* Panels & data viz                                                  */
/* ------------------------------------------------------------------ */

/** Rounded content panel (fill + edge). */
export function panel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r = 20,
): void {
  fillRoundRect(ctx, x, y, w, h, r, BRAND.panel);
  strokeRoundRect(ctx, x, y, w, h, r, BRAND.panelEdge, 1.5);
}

export interface StatTile {
  label: string;
  value: string;
  sub?: string | null;
  /** Accent color for the value (default ink). */
  color?: string;
}

/** Labeled stat block inside a soft panel. */
export function statTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  tile: StatTile,
): void {
  panel(ctx, x, y, w, h, 18);
  ctx.fillStyle = BRAND.mute;
  ctx.font = font("600 19px");
  drawTracked(ctx, tile.label.toUpperCase(), x + 24, y + 42, 2.5);

  const valuePx = fitSize(ctx, tile.value, w - 48, 800, Math.min(46, h * 0.3), 26);
  ctx.fillStyle = tile.color ?? BRAND.ink;
  ctx.font = font(`800 ${valuePx}px`);
  ctx.fillText(tile.value, x + 24, y + h * (tile.sub ? 0.62 : 0.68));

  if (tile.sub) {
    ctx.fillStyle = BRAND.mute;
    ctx.font = font("500 21px");
    ctx.fillText(ellipsize(ctx, tile.sub, w - 48), x + 24, y + h - 24);
  }
}

/** Win-rate ring gauge with glow; null pct renders an em dash. */
export function wrRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  pct: number | null,
  accent: string = BRAND.lime,
): void {
  const lw = Math.max(10, Math.round(r * 0.16));
  // Soft inner fill
  ctx.save();
  ctx.fillStyle = withAlpha(accent, 0.05);
  ctx.beginPath();
  ctx.arc(cx, cy, r - lw, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Track
  ctx.strokeStyle = "rgba(255,255,255,0.09)";
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  if (pct != null) {
    const frac = Math.max(0.02, Math.min(1, pct / 100));
    const color = pct >= 55 ? BRAND.win : pct <= 45 ? BRAND.loss : accent;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.lineCap = "round";
    ctx.shadowColor = withAlpha(color, 0.55);
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Center readout
  const color =
    pct == null ? BRAND.mute : pct >= 55 ? BRAND.win : pct <= 45 ? BRAND.loss : BRAND.ink;
  ctx.fillStyle = color;
  const label = pct == null ? "—" : `${Math.round(pct)}%`;
  const px = fitSize(ctx, label, r * 1.5, 800, Math.round(r * 0.52), 20);
  ctx.font = font(`800 ${px}px`);
  const tw = ctx.measureText(label).width;
  ctx.fillText(label, cx - tw / 2, cy + px * 0.18);
  ctx.fillStyle = BRAND.mute;
  ctx.font = font("600 15px");
  const sub = "WIN RATE";
  const sw = trackedWidth(ctx, sub, 2);
  drawTracked(ctx, sub, cx - sw / 2, cy + px * 0.18 + 26, 2);
}

/** Filled glow pill (e.g. VICTORY); returns total width consumed. */
export function pill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  color: string,
  fontPx = 24,
): number {
  ctx.font = font(`800 ${fontPx}px`);
  const tw = trackedWidth(ctx, text.toUpperCase(), 2);
  const w = tw + 44;
  const h = Math.round(fontPx * 1.9);
  ctx.save();
  ctx.shadowColor = withAlpha(color, 0.5);
  ctx.shadowBlur = 16;
  fillRoundRect(ctx, x, y, w, h, h / 2, color);
  ctx.restore();
  ctx.fillStyle = "#07120b";
  drawTracked(ctx, text.toUpperCase(), x + 22, y + h / 2 + fontPx * 0.35, 2);
  return w;
}

/** Outline chip (e.g. format, tag); returns total width consumed. */
export function chip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  color: string = BRAND.mute,
  fontPx = 22,
): number {
  ctx.font = font(`600 ${fontPx}px`);
  const tw = ctx.measureText(text).width;
  const w = tw + 36;
  const h = Math.round(fontPx * 1.85);
  fillRoundRect(ctx, x, y, w, h, h / 2, withAlpha(color, 0.1));
  strokeRoundRect(ctx, x, y, w, h, h / 2, withAlpha(color, 0.5), 1.5);
  ctx.fillStyle = color;
  ctx.fillText(text, x + 18, y + h / 2 + fontPx * 0.34);
  return w;
}

/** Horizontal progress bar with rounded track + glow fill. */
export function ratioBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  frac: number,
  color: string,
): void {
  fillRoundRect(ctx, x, y, w, h, h / 2, "rgba(255,255,255,0.07)");
  const fw = Math.max(h, w * Math.max(0, Math.min(1, frac)));
  ctx.save();
  ctx.shadowColor = withAlpha(color, 0.45);
  ctx.shadowBlur = 12;
  const grad = ctx.createLinearGradient(x, y, x + fw, y);
  grad.addColorStop(0, withAlpha(color, 0.55));
  grad.addColorStop(1, color);
  fillRoundRect(ctx, x, y, fw, h, h / 2, grad);
  ctx.restore();
}

/** Area sparkline with end-point markers. values are raw scores. */
export function sparkline(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  values: number[],
  accent: string = BRAND.lime,
  markMax = false,
): void {
  if (values.length < 2) return;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const px = (i: number) => x + (i / (values.length - 1)) * w;
  const py = (v: number) => y + h - ((v - min) / span) * h;

  // Area fill
  const area = ctx.createLinearGradient(0, y, 0, y + h);
  area.addColorStop(0, withAlpha(accent, 0.24));
  area.addColorStop(1, withAlpha(accent, 0));
  ctx.beginPath();
  ctx.moveTo(px(0), y + h);
  values.forEach((v, i) => ctx.lineTo(px(i), py(v)));
  ctx.lineTo(px(values.length - 1), y + h);
  ctx.closePath();
  ctx.fillStyle = area;
  ctx.fill();

  // Line
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.shadowColor = withAlpha(accent, 0.5);
  ctx.shadowBlur = 12;
  ctx.beginPath();
  values.forEach((v, i) => {
    if (i === 0) ctx.moveTo(px(i), py(v));
    else ctx.lineTo(px(i), py(v));
  });
  ctx.stroke();
  ctx.restore();

  // Peak marker (skipped when the peak is the current point)
  const peakIdx = values.indexOf(max);
  if (markMax && peakIdx !== values.length - 1) {
    ctx.fillStyle = BRAND.gold;
    ctx.beginPath();
    ctx.arc(px(peakIdx), py(max), 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = withAlpha(BRAND.gold, 0.45);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(px(peakIdx), py(max), 13, 0, Math.PI * 2);
    ctx.stroke();
  }

  // End dot with ring
  const ex = px(values.length - 1);
  const ey = py(values[values.length - 1]);
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(ex, ey, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = withAlpha(accent, 0.4);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(ex, ey, 14, 0, Math.PI * 2);
  ctx.stroke();
}

/* ------------------------------------------------------------------ */
/* Mana pips                                                          */
/* ------------------------------------------------------------------ */

export const MANA_PIP: Record<string, string> = {
  w: "#f4e7bd",
  u: "#3487c9",
  b: "#7d736d",
  r: "#e0424a",
  g: "#22a55f",
  c: "#b9b9b9",
  multi: "#e8c56a",
};

/** Row of mana-color pips; returns the x after the last pip. */
export function drawPips(
  ctx: CanvasRenderingContext2D,
  x: number,
  cy: number,
  keys: string[],
  r = 13,
): number {
  let cx = x;
  for (const k of keys) {
    const color = MANA_PIP[k] ?? BRAND.mute;
    const grad = ctx.createRadialGradient(
      cx + r * 0.35,
      cy - r * 0.4,
      r * 0.2,
      cx + r,
      cy,
      r * 1.35,
    );
    grad.addColorStop(0, withAlpha(color, 0.95));
    grad.addColorStop(1, withAlpha(color, 0.72));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx + r, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    cx += r * 2 + 10;
  }
  return cx;
}
