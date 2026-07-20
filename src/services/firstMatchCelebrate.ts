/**
 * One-shot "first match recorded" celebration (D1 complement).
 * Local only.
 */

const KEY = "bbi.firstMatch.celebrated";

export function hasCelebratedFirstMatch(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function markFirstMatchCelebrated(): void {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* ignore */
  }
}

/** True when we should fire the first-match toast this transition. */
export function shouldCelebrateFirstMatch(
  prevCount: number,
  nextCount: number,
): boolean {
  if (hasCelebratedFirstMatch()) return false;
  return prevCount === 0 && nextCount >= 1;
}
