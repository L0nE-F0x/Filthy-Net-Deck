/**
 * Arena grpId → display meta (name, land, art) via Scryfall.
 * Persisted in localStorage so rematches don't re-hit the network.
 */
import { apiFetch } from "./http";
import { scryfallCdnUrl } from "./scryfall";

export type ArenaCardMeta = {
  name: string;
  typeLine: string;
  isLand: boolean;
  scryfallId: string;
  /** Small face art CDN URL (or null if unknown). */
  artUrl: string | null;
};

const LS_KEY = "bbi.arenaMeta.v1";
const mem = new Map<number, ArenaCardMeta | null>();
const inflight = new Map<number, Promise<ArenaCardMeta | null>>();

function loadDisk(): void {
  if (mem.size) return;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw) as Record<string, ArenaCardMeta | null>;
    for (const [k, v] of Object.entries(obj)) {
      const id = Number(k);
      if (Number.isFinite(id)) mem.set(id, v);
    }
  } catch {
    /* ignore */
  }
}

let persistTimer: number | undefined;
function schedulePersist(): void {
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    try {
      const obj: Record<string, ArenaCardMeta | null> = {};
      // Cap cache size so localStorage stays small.
      let n = 0;
      for (const [id, meta] of mem) {
        if (n++ > 4000) break;
        obj[String(id)] = meta;
      }
      localStorage.setItem(LS_KEY, JSON.stringify(obj));
    } catch {
      /* quota */
    }
  }, 800);
}

type ScryfallArenaCard = {
  id?: string;
  name?: string;
  type_line?: string;
  card_faces?: { name?: string; type_line?: string; image_uris?: Record<string, string> }[];
  image_uris?: Record<string, string>;
};

function isLandType(typeLine: string): boolean {
  // "Legendary Land — …", "Basic Land — Island", "Artifact Land", etc.
  return /(?:^| )\bLand\b/.test(typeLine);
}

function fromScryfall(data: ScryfallArenaCard): ArenaCardMeta | null {
  const name =
    data.name?.trim() || data.card_faces?.[0]?.name?.trim() || "";
  if (!name) return null;
  const typeLine =
    data.type_line?.trim() ||
    data.card_faces?.[0]?.type_line?.trim() ||
    "";
  const scryfallId = data.id?.trim() || "";
  const artUrl = scryfallId ? scryfallCdnUrl(scryfallId, "small") : null;
  return {
    name,
    typeLine,
    isLand: isLandType(typeLine),
    scryfallId,
    artUrl,
  };
}

export function peekArenaMeta(grpId: number): ArenaCardMeta | null | undefined {
  loadDisk();
  return mem.has(grpId) ? mem.get(grpId) : undefined;
}

export async function resolveArenaMeta(
  grpId: number,
): Promise<ArenaCardMeta | null> {
  loadDisk();
  if (mem.has(grpId)) return mem.get(grpId) ?? null;
  const existing = inflight.get(grpId);
  if (existing) return existing;

  const p = (async () => {
    try {
      const res = await apiFetch(
        `https://api.scryfall.com/cards/arena/${grpId}`,
        { headers: { Accept: "application/json" } },
      );
      if (!res.ok) {
        mem.set(grpId, null);
        schedulePersist();
        return null;
      }
      const data = (await res.json()) as ScryfallArenaCard;
      const meta = fromScryfall(data);
      mem.set(grpId, meta);
      schedulePersist();
      return meta;
    } catch {
      // Don't cache hard-fail forever — allow retry next session only after null write.
      mem.set(grpId, null);
      schedulePersist();
      return null;
    } finally {
      inflight.delete(grpId);
    }
  })();

  inflight.set(grpId, p);
  return p;
}

/** Resolve many ids with low concurrency (Scryfall-friendly). */
export async function resolveArenaMetaBatch(
  ids: number[],
  concurrency = 2,
): Promise<void> {
  loadDisk();
  const missing = ids.filter((id) => peekArenaMeta(id) === undefined);
  if (!missing.length) return;
  let i = 0;
  async function worker() {
    while (i < missing.length) {
      const id = missing[i++];
      await resolveArenaMeta(id);
      // ~100ms between calls per worker keeps us under Scryfall guidance.
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, missing.length) }, () =>
      worker(),
    ),
  );
}
