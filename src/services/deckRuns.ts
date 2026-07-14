/**
 * "Fresh run" markers, per deck. Starting a run hides that deck's older
 * matches from the stats (non-destructive — ending the run brings them back).
 * Stored locally, keyed by the tracker deckKey.
 */

const RUNS_KEY = "bbi.deckRuns";

export type DeckRuns = Record<string, number>;

export function loadDeckRuns(): DeckRuns {
  try {
    const raw = localStorage.getItem(RUNS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DeckRuns;
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch {
    /* ignore */
  }
  return {};
}

function save(runs: DeckRuns) {
  try {
    localStorage.setItem(RUNS_KEY, JSON.stringify(runs));
  } catch {
    /* ignore */
  }
}

/** Start a fresh run for a deck now; returns the updated map. */
export function startDeckRun(key: string): DeckRuns {
  const runs = { ...loadDeckRuns(), [key]: Date.now() };
  save(runs);
  return runs;
}

/** End a deck's fresh run (older matches show again); returns the updated map. */
export function endDeckRun(key: string): DeckRuns {
  const runs = { ...loadDeckRuns() };
  delete runs[key];
  save(runs);
  return runs;
}
