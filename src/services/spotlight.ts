import type { CardEntry } from "../types/meta";

/**
 * Premier-event spotlight. The pipeline writes `spotlight.json`; this module
 * decides when the sidebar chip is on and which rows the panel shows.
 * Dates are civil days (YYYY-MM-DD), compared to the viewer's local date.
 */

export type SpotlightFormat = "standard" | "pioneer";
export type SpotlightPhase = "hidden" | "live" | "showcase";

export interface SpotlightDeck {
  id: string;
  player: string;
  archetype: string;
  mainboard: CardEntry[];
  sideboard: CardEntry[];
  sourceUrl?: string;
}

export interface SpotlightStanding {
  rank: number;
  player: string;
  points: number;
  omw: number | null;
  deckId: string | null;
}

export interface SpotlightEvent {
  id: string;
  name: string;
  format: SpotlightFormat;
  starts: string;
  ends: string;
  showcaseUntil: string;
  eventUrl: string;
  standingsRound: number | null;
  standingsUrl: string | null;
  decks: SpotlightDeck[];
  standings: SpotlightStanding[];
}

export interface SpotlightFeed {
  generatedAt: string;
  event: SpotlightEvent | null;
}

export interface SpotlightRow {
  key: string;
  deckId: string | null;
  player: string;
  archetype: string;
  rank: number | null;
  points: number | null;
  omw: number | null;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function localDateISO(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function spotlightPhase(
  event: Pick<SpotlightEvent, "starts" | "ends" | "showcaseUntil"> | null | undefined,
  now: Date = new Date(),
): SpotlightPhase {
  if (!event) return "hidden";
  if (!DAY.test(event.starts) || !DAY.test(event.ends) || !DAY.test(event.showcaseUntil)) {
    return "hidden";
  }
  const day = localDateISO(now);
  if (day < event.starts || day > event.showcaseUntil) return "hidden";
  if (day <= event.ends) return "live";
  return "showcase";
}

/**
 * Live standings older than 3 hours are probably a round behind.
 * The hourly job leaves generatedAt alone when nothing changed, so one quiet
 * hour between rounds must not light this up. Two missed runs still do.
 */
export function spotlightIsStale(
  generatedAt: string | null | undefined,
  phase: SpotlightPhase,
  nowMs: number = Date.now(),
): boolean {
  if (phase !== "live" || !generatedAt) return false;
  const t = Date.parse(generatedAt);
  if (!Number.isFinite(t)) return false;
  return nowMs - t > 3 * 60 * 60 * 1000;
}

export function omwPercent(omw: number | null): string | null {
  if (omw == null || !Number.isFinite(omw)) return null;
  const pct = omw <= 1 ? omw * 100 : omw;
  return `${pct.toFixed(1)}%`;
}

function cards(raw: unknown): CardEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: CardEntry[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const count = Number((row as { count?: unknown }).count);
    const name = String((row as { name?: unknown }).name || "").trim();
    if (!name || !Number.isFinite(count) || count < 1 || count > 99) continue;
    out.push({ count, name });
  }
  return out;
}

export function parseSpotlightFeed(data: unknown): SpotlightFeed | null {
  if (!data || typeof data !== "object") return null;
  const generatedAt = String((data as { generatedAt?: unknown }).generatedAt || "");
  const raw = (data as { event?: unknown }).event;
  if (raw == null) return { generatedAt, event: null };
  if (typeof raw !== "object") return null;
  const e = raw as Partial<SpotlightEvent>;
  if (e.format !== "standard" && e.format !== "pioneer") return null;
  if (!e.id || !e.name || !DAY.test(String(e.starts)) || !DAY.test(String(e.ends))) return null;
  if (!DAY.test(String(e.showcaseUntil))) return null;
  const decks: SpotlightDeck[] = [];
  for (const d of Array.isArray(e.decks) ? e.decks : []) {
    if (!d || typeof d !== "object") continue;
    const id = String((d as SpotlightDeck).id || "").trim();
    const player = String((d as SpotlightDeck).player || "").trim();
    if (!id || !player) continue;
    decks.push({
      id,
      player,
      archetype: String((d as SpotlightDeck).archetype || ""),
      mainboard: cards((d as SpotlightDeck).mainboard),
      sideboard: cards((d as SpotlightDeck).sideboard),
      sourceUrl: String((d as SpotlightDeck).sourceUrl || "") || undefined,
    });
  }
  const standings: SpotlightStanding[] = [];
  for (const s of Array.isArray(e.standings) ? e.standings : []) {
    if (!s || typeof s !== "object") continue;
    const rank = Number((s as SpotlightStanding).rank);
    const player = String((s as SpotlightStanding).player || "").trim();
    const points = Number((s as SpotlightStanding).points);
    if (!player || !Number.isInteger(rank) || rank < 1 || !Number.isFinite(points)) continue;
    const omwRaw = (s as SpotlightStanding).omw;
    const omw = omwRaw == null ? null : Number(omwRaw);
    const deckId = (s as SpotlightStanding).deckId;
    standings.push({
      rank,
      player,
      points,
      omw: omw != null && Number.isFinite(omw) ? omw : null,
      deckId: typeof deckId === "string" && deckId ? deckId : null,
    });
  }
  const round = e.standingsRound;
  return {
    generatedAt,
    event: {
      id: String(e.id),
      name: String(e.name),
      format: e.format,
      starts: String(e.starts),
      ends: String(e.ends),
      showcaseUntil: String(e.showcaseUntil),
      eventUrl: String(e.eventUrl || ""),
      standingsRound: typeof round === "number" && Number.isFinite(round) ? round : null,
      standingsUrl: e.standingsUrl ? String(e.standingsUrl) : null,
      decks,
      standings,
    },
  };
}

/**
 * Live: the whole published field, standings order, unmatched lists at the bottom.
 * Showcase week: the top 8 that have a list. After that the caller hides the chip.
 */
export function spotlightRows(
  event: SpotlightEvent | null | undefined,
  phase: SpotlightPhase,
): SpotlightRow[] {
  if (!event || phase === "hidden") return [];
  const decks = new Map(event.decks.map((d) => [d.id, d]));
  const used = new Set<string>();
  const rows: SpotlightRow[] = [];
  const standings = [...event.standings].sort((a, b) => a.rank - b.rank);
  for (const s of standings) {
    if (phase === "showcase" && s.rank > 8) continue;
    const deck = s.deckId ? decks.get(s.deckId) : undefined;
    if (phase === "showcase" && !deck) continue;
    if (deck) used.add(deck.id);
    rows.push({
      key: deck?.id ?? `rank-${s.rank}`,
      deckId: deck?.id ?? null,
      player: deck?.player ?? s.player,
      archetype: deck?.archetype ?? "",
      rank: s.rank,
      points: s.points,
      omw: s.omw,
    });
  }
  if (phase === "live") {
    for (const deck of event.decks) {
      if (used.has(deck.id)) continue;
      rows.push({
        key: deck.id,
        deckId: deck.id,
        player: deck.player,
        archetype: deck.archetype,
        rank: null,
        points: null,
        omw: null,
      });
    }
  }
  return rows;
}
