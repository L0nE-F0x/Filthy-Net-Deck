/** One-shot first-run flag — the Help & tour auto-opens once per PC. */
const SEEN_KEY = "bbi.helpSeen.v1";

export function helpTourWasSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

export function markHelpTourSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* ignore */
  }
}
