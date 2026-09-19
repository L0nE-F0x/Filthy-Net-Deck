/** True when (x, y) sits inside `r`, including the edges. */
export function pointInRect(
  x: number,
  y: number,
  r: { left: number; top: number; right: number; bottom: number } | null | undefined,
): boolean {
  if (!r) return false;
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}
