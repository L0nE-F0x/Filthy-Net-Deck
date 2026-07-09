import type { MetaBundle } from "../types/meta";

const SNAPSHOT_KEY = "bbi.meta.snapshot";

export interface MetaChange {
  formatId: string;
  formatName: string;
  mode: "bo1" | "bo3";
  rose: string[];
  fell: string[];
  entered: string[];
  left: string[];
}

export function saveSnapshot(bundle: MetaBundle) {
  try {
    const slim = {
      date: bundle.date,
      formats: bundle.formats.map((f) => ({
        id: f.id,
        name: f.name,
        bo1: (f.bo1DeckIds || []).map((id) => bundle.decks[id]?.name).filter(Boolean),
        bo3: (f.bo3DeckIds || []).map((id) => bundle.decks[id]?.name).filter(Boolean),
      })),
    };
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(slim));
  } catch {
    /* ignore */
  }
}

export function loadPreviousSnapshot(): {
  date: string;
  formats: { id: string; name: string; bo1: string[]; bo3: string[] }[];
} | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as {
      date: string;
      formats: { id: string; name: string; bo1: string[]; bo3: string[] }[];
    };
  } catch {
    return null;
  }
}

export function computeDiff(current: MetaBundle): {
  previousDate: string | null;
  changes: MetaChange[];
} {
  const prev = loadPreviousSnapshot();
  if (!prev || prev.date === current.date) {
    return { previousDate: prev?.date ?? null, changes: [] };
  }

  const changes: MetaChange[] = [];
  for (const fmt of current.formats) {
    const old = prev.formats.find((f) => f.id === fmt.id);
    if (!old) continue;
    for (const mode of ["bo1", "bo3"] as const) {
      const now = (mode === "bo1" ? fmt.bo1DeckIds : fmt.bo3DeckIds)
        .map((id) => current.decks[id]?.name)
        .filter(Boolean) as string[];
      const was = mode === "bo1" ? old.bo1 : old.bo3;
      const nowSet = new Set(now);
      const wasSet = new Set(was);
      const entered = now.filter((n) => !wasSet.has(n));
      const left = was.filter((n) => !nowSet.has(n));
      // rose / fell by rank position
      const rose: string[] = [];
      const fell: string[] = [];
      for (const name of now) {
        const ni = now.indexOf(name);
        const wi = was.indexOf(name);
        if (wi >= 0 && ni < wi) rose.push(name);
        if (wi >= 0 && ni > wi) fell.push(name);
      }
      if (rose.length || fell.length || entered.length || left.length) {
        changes.push({
          formatId: fmt.id,
          formatName: fmt.name,
          mode,
          rose,
          fell,
          entered,
          left,
        });
      }
    }
  }
  return { previousDate: prev.date, changes };
}
