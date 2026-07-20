/**
 * One-shot desktop notify when the daily meta board moves (rose / entered).
 * Local only; signature stored so we don't spam.
 */

import type { MetaChange } from "./metaDiff";

const FIRED_KEY = "bbi.metaMover.notified";

export function metaMoverSignature(
  forDate: string | null | undefined,
  changes: MetaChange[],
): string {
  const parts = [forDate ?? "unknown"];
  for (const c of changes) {
    if (c.rose[0]) parts.push(`${c.formatId}:${c.mode}:↑${c.rose[0]}`);
    if (c.entered[0]) parts.push(`${c.formatId}:${c.mode}:+${c.entered[0]}`);
  }
  return parts.join("|");
}

/** One-line summary for notification body; null if nothing worth saying. */
export function summarizeMetaMovers(changes: MetaChange[]): string | null {
  const bits: string[] = [];
  for (const c of changes) {
    const head = c.rose[0] ?? c.entered[0];
    if (!head) continue;
    const verb = c.rose[0] ? "rising" : "new";
    bits.push(`${head} (${c.formatName} ${c.mode.toUpperCase()}, ${verb})`);
    if (bits.length >= 3) break;
  }
  if (!bits.length) return null;
  return bits.join(" · ");
}

export function shouldFireMetaMoverNotify(signature: string): boolean {
  if (!signature || signature === "unknown") return false;
  try {
    const raw = localStorage.getItem(FIRED_KEY);
    if (!raw) return true;
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return true;
    return !arr.includes(signature);
  } catch {
    return true;
  }
}

export function markMetaMoverNotifyFired(signature: string): void {
  try {
    const raw = localStorage.getItem(FIRED_KEY);
    let arr: string[] = [];
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        arr = parsed.filter((x): x is string => typeof x === "string");
      }
    }
    if (!arr.includes(signature)) arr.push(signature);
    // Cap so prefs blob stays small.
    localStorage.setItem(FIRED_KEY, JSON.stringify(arr.slice(-40)));
  } catch {
    /* ignore */
  }
}
