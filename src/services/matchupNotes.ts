/**
 * Local-only matchup annotations: archetype tags + freeform notes per opponent.
 * Never leaves the machine.
 */

export interface OpponentNote {
  /** User-assigned archetype / deck tag, e.g. "Domain" or "Izzet Prowess". */
  tag?: string;
  /** Prep notes — sideboard plans, tells, etc. */
  notes?: string;
  updatedAt: number;
}

const KEY = "bbi.matchupNotes.v1";

type Store = Record<string, OpponentNote>;

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Store;
  } catch {
    /* ignore */
  }
  return {};
}

function save(store: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

/** Normalize opponent key for stable lookups. */
export function opponentKey(name: string | undefined | null): string {
  return (name ?? "Unknown").trim().toLowerCase() || "unknown";
}

export function getOpponentNote(name: string | undefined | null): OpponentNote | null {
  return load()[opponentKey(name)] ?? null;
}

export function loadAllOpponentNotes(): Store {
  return load();
}

export function setOpponentNote(
  name: string | undefined | null,
  patch: { tag?: string; notes?: string },
): OpponentNote {
  const store = load();
  const key = opponentKey(name);
  const prev = store[key] ?? { updatedAt: Date.now() };
  const next: OpponentNote = {
    tag: patch.tag !== undefined ? patch.tag.trim() || undefined : prev.tag,
    notes: patch.notes !== undefined ? patch.notes : prev.notes,
    updatedAt: Date.now(),
  };
  // Drop empty records
  if (!next.tag && !next.notes?.trim()) {
    delete store[key];
    save(store);
    return next;
  }
  store[key] = next;
  save(store);
  return next;
}

/**
 * Your win/loss record against each archetype tag, keyed by lowercased tag.
 * Lets the Decks page show "you vs this archetype" when a tag matches a meta
 * archetype name — the bridge between the meta and your own games.
 */
export function recordVsTags(
  matches: { opponentName?: string; result: string }[],
): Record<string, { wins: number; losses: number }> {
  const store = load();
  const out: Record<string, { wins: number; losses: number }> = {};
  for (const m of matches) {
    const tag = store[opponentKey(m.opponentName)]?.tag;
    if (!tag) continue;
    const key = tag.trim().toLowerCase();
    if (!key) continue;
    const rec = (out[key] ??= { wins: 0, losses: 0 });
    if (m.result === "win") rec.wins++;
    else if (m.result === "loss") rec.losses++;
  }
  return out;
}

/** Unique tags the user has assigned (for filter chips / autocomplete). */
export function listKnownTags(): string[] {
  const tags = new Set<string>();
  for (const n of Object.values(load())) {
    if (n.tag) tags.add(n.tag);
  }
  return [...tags].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}
