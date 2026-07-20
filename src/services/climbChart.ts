/**
 * Pure SVG path + deck colour helpers for Climb (peeled from Climb.tsx).
 */

import { deckColorIndex } from "./climbStats";

/** Chart / legend palette — distinct enough on dark and light themes. */
export const DECK_PALETTE = [
  "#d4a84b",
  "#4a7fd4",
  "#34d399",
  "#f87171",
  "#a78bfa",
  "#fbbf24",
  "#2dd4bf",
  "#fb7185",
  "#60a5fa",
  "#c084fc",
] as const;

export function deckSwatch(
  key: string,
  palette: readonly string[] = DECK_PALETTE,
): string {
  if (!palette.length) return "#888";
  return palette[deckColorIndex(key, palette.length)];
}

/**
 * Monotone cubic (Fritsch–Carlson) path through points. Smooths the curve
 * without overshooting past any data point.
 */
export function monotonePath(pts: { x: number; y: number }[]): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const d = pts[i + 1].x - pts[i].x || 1e-6;
    dx.push(d);
    slope.push((pts[i + 1].y - pts[i].y) / d);
  }
  const tan: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) {
    tan.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
  }
  tan.push(slope[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      tan[i] = 0;
      tan[i + 1] = 0;
      continue;
    }
    const a = tan[i] / slope[i];
    const b = tan[i + 1] / slope[i];
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      tan[i] = tau * a * slope[i];
      tan[i + 1] = tau * b * slope[i];
    }
  }
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d +=
      ` C ${(pts[i].x + h).toFixed(1)} ${(pts[i].y + tan[i] * h).toFixed(1)}` +
      ` ${(pts[i + 1].x - h).toFixed(1)} ${(pts[i + 1].y - tan[i + 1] * h).toFixed(1)}` +
      ` ${pts[i + 1].x.toFixed(1)} ${pts[i + 1].y.toFixed(1)}`;
  }
  return d;
}
