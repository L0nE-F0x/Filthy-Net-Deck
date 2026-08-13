/**
 * List clinic — your 75 vs the closest ranked list on today's board.
 *
 * Distance is the multiset L1 / 2 ("cards off"): one swap is 1 card off.
 * Never invents cards. Closest list is chosen by the list itself, not the
 * deck's display name — a pile named "jank" that is 2 off Golgari is Golgari.
 */

import type { CardEntry, Deck, FormatId, MetaBundle, PlayMode } from "../types/meta";
import { decksForMode } from "./deckHelpers";
import { isLandName } from "./landNames";

export interface CountedName {
  name: string;
  count: number;
  cmc?: number;
  land?: boolean;
  type?: CardEntry["type"];
  typeLine?: string;
}

export interface ClinicSwap {
  name: string;
  yours: number;
  ranked: number;
}

export interface BoardDiff {
  cardsOff: number;
  yoursTotal: number;
  rankedTotal: number;
  /** You play it; the ranked list does not. */
  extras: ClinicSwap[];
  /** Ranked list plays it; you do not. */
  missing: ClinicSwap[];
  /** Both play it, different counts. */
  counts: ClinicSwap[];
  identical: boolean;
}

export interface ListClinicReport {
  mode: PlayMode;
  formatId: FormatId | null;
  rankedName: string | null;
  rankedId: string | null;
  /** True when a name match existed but a different list was closer. */
  nameWasOverridden: boolean;
  namedMatch: string | null;
  main: BoardDiff;
  side: BoardDiff | null;
  emptyReason?: string;
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function countMap(cards: CountedName[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of cards) {
    const k = norm(c.name);
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + c.count);
  }
  return m;
}

function displayNameFor(key: string, lists: CountedName[][]): string {
  for (const list of lists) {
    for (const c of list) {
      if (norm(c.name) === key) return c.name;
    }
  }
  return key;
}

/** Sum of |your − theirs| across every card name. */
export function l1Distance(a: CountedName[], b: CountedName[]): number {
  const A = countMap(a);
  const B = countMap(b);
  const keys = new Set([...A.keys(), ...B.keys()]);
  let n = 0;
  for (const k of keys) n += Math.abs((A.get(k) ?? 0) - (B.get(k) ?? 0));
  return n;
}

/** Substitutions vs the other list. One swap = 1. */
export function cardsOff(a: CountedName[], b: CountedName[]): number {
  return l1Distance(a, b) / 2;
}

export function boardDiff(yours: CountedName[], ranked: CountedName[]): BoardDiff {
  const Y = countMap(yours);
  const R = countMap(ranked);
  const extras: ClinicSwap[] = [];
  const missing: ClinicSwap[] = [];
  const counts: ClinicSwap[] = [];
  const names = new Set([...Y.keys(), ...R.keys()]);
  for (const k of [...names].sort()) {
    const y = Y.get(k) ?? 0;
    const r = R.get(k) ?? 0;
    if (y === r) continue;
    const row: ClinicSwap = {
      name: displayNameFor(k, [yours, ranked]),
      yours: y,
      ranked: r,
    };
    if (r === 0) extras.push(row);
    else if (y === 0) missing.push(row);
    else counts.push(row);
  }
  const yoursTotal = yours.reduce((n, c) => n + Math.max(0, c.count | 0), 0);
  const rankedTotal = ranked.reduce((n, c) => n + Math.max(0, c.count | 0), 0);
  return {
    cardsOff: l1Distance(yours, ranked) / 2,
    yoursTotal,
    rankedTotal,
    extras,
    missing,
    counts,
    identical: extras.length === 0 && missing.length === 0 && counts.length === 0,
  };
}

function typeFromFace(face: string): CardEntry["type"] | undefined {
  if (/\bCreature\b/i.test(face)) return "creature";
  if (/\bInstant\b/i.test(face)) return "instant";
  if (/\bSorcery\b/i.test(face)) return "sorcery";
  if (/\bEnchantment\b/i.test(face)) return "enchantment";
  if (/\bArtifact\b/i.test(face)) return "artifact";
  if (/\bPlaneswalker\b/i.test(face)) return "planeswalker";
  if (/\bBattle\b/i.test(face)) return "battle";
  return undefined;
}

/** CardEntry[] (meta pipeline) → counted names. */
export function fromCardEntries(entries: CardEntry[]): CountedName[] {
  return entries.map((c) => ({
    name: c.name,
    count: c.count,
    cmc: c.cmc,
    land: c.land,
    type: c.type,
  }));
}

/** Arena id multiset + resolved meta → counted names. Unknown ids dropped. */
export function fromArenaIds(
  ids: number[],
  cards: Record<number, { name?: string; typeLine?: string; cmc?: number } | null | undefined>,
): CountedName[] {
  const counts = new Map<number, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  const out: CountedName[] = [];
  for (const [id, count] of counts) {
    const info = cards[id];
    if (!info?.name) continue;
    const typeLine = info.typeLine;
    const face = typeLine?.split("//")[0] ?? "";
    out.push({
      name: info.name,
      count,
      cmc: info.cmc,
      land: /\bLand\b/i.test(face) || isLandName(info.name),
      type: typeFromFace(face),
      typeLine,
    });
  }
  return out;
}

/**
 * Pasted deck lines + name resolution → counted names. Unresolved names
 * come back in `unknown` so the UI can say so — they are skipped, never guessed.
 */
export function fromNamedLines(
  lines: { name: string; count: number }[],
  info: Record<string, { name?: string; typeLine?: string; cmc?: number } | null | undefined>,
  normalize: (s: string) => string,
): { cards: CountedName[]; unknown: string[] } {
  const cards: CountedName[] = [];
  const unknown: string[] = [];
  const merged = new Map<string, CountedName>();
  for (const line of lines) {
    const hit = info[normalize(line.name)];
    if (!hit?.name) {
      unknown.push(line.name);
      continue;
    }
    const typeLine = hit.typeLine;
    const face = typeLine?.split("//")[0] ?? "";
    const key = norm(hit.name);
    const prev = merged.get(key);
    if (prev) {
      prev.count += line.count;
      continue;
    }
    const c: CountedName = {
      name: hit.name,
      count: line.count,
      cmc: hit.cmc,
      land: /\bLand\b/i.test(face) || isLandName(hit.name),
      type: typeFromFace(face),
      typeLine,
    };
    merged.set(key, c);
    cards.push(c);
  }
  return { cards, unknown };
}

function nameAffinity(query: string, deck: Deck): number {
  const q = norm(query);
  if (!q) return 0;
  const labels = [deck.name, deck.archetype].filter(Boolean).map((s) => norm(String(s)));
  if (labels.includes(q)) return 2;
  if (labels.some((l) => l.includes(q) || q.includes(l))) return 1;
  return 0;
}

export interface ClosestHit {
  deck: Deck;
  formatId: FormatId;
  mode: PlayMode;
  l1: number;
}

/** Ranked board only (the 8), both formats, requested mode. */
export function closestRankedDeck(
  yours: CountedName[],
  meta: MetaBundle,
  opts: { mode: PlayMode; preferFormat?: FormatId | null; preferName?: string },
): ClosestHit | null {
  if (!yours.length) return null;
  let best: ClosestHit | null = null;
  let bestAffinity = -1;
  for (const fmt of meta.formats) {
    for (const deck of decksForMode(fmt, opts.mode, meta.decks)) {
      if (!deck.mainboard?.length) continue;
      const l1 = l1Distance(yours, fromCardEntries(deck.mainboard));
      const affinity = nameAffinity(opts.preferName ?? "", deck);
      const preferFmt = opts.preferFormat && fmt.id === opts.preferFormat ? 1 : 0;
      if (
        !best ||
        l1 < best.l1 ||
        (l1 === best.l1 && affinity > bestAffinity) ||
        (l1 === best.l1 && affinity === bestAffinity && preferFmt && best.formatId !== opts.preferFormat)
      ) {
        best = { deck, formatId: fmt.id, mode: opts.mode, l1 };
        bestAffinity = affinity;
      }
    }
  }
  return best;
}

function namedHit(
  meta: MetaBundle,
  name: string | undefined,
  mode: PlayMode,
): { name: string; formatId: FormatId } | null {
  if (!name?.trim()) return null;
  let best: { name: string; formatId: FormatId; score: number } | null = null;
  for (const fmt of meta.formats) {
    for (const deck of decksForMode(fmt, mode, meta.decks)) {
      const score = nameAffinity(name, deck);
      if (score === 0) continue;
      if (!best || score > best.score) {
        best = { name: deck.name, formatId: fmt.id, score };
      }
    }
  }
  return best ? { name: best.name, formatId: best.formatId } : null;
}

export interface ListClinicInput {
  deckName?: string;
  main: CountedName[];
  side?: CountedName[];
  meta: MetaBundle | null | undefined;
  mode: PlayMode;
  preferFormat?: FormatId;
}

export function runListClinic(input: ListClinicInput): ListClinicReport {
  const { main, side, meta, mode } = input;
  if (!meta) {
    return emptyReport(mode, "Meta feed not loaded yet — open Decks once so today’s board is available.");
  }
  if (!main.length) {
    return emptyReport(
      mode,
      "No stored Arena mainboard on this deck yet. Play a match with the list so FND can read game-1 submission.",
    );
  }

  const hit = closestRankedDeck(main, meta, {
    mode,
    preferFormat: input.preferFormat,
    preferName: input.deckName,
  });
  if (!hit) {
    return emptyReport(mode, "No ranked lists for this mode in today’s feed.");
  }

  const named = namedHit(meta, input.deckName, mode);
  const mainDiff = boardDiff(main, fromCardEntries(hit.deck.mainboard));
  const rankedSide = hit.deck.sideboard ?? [];
  const sideDiff =
    side && side.length && rankedSide.length
      ? boardDiff(side, fromCardEntries(rankedSide))
      : null;

  return {
    mode,
    formatId: hit.formatId,
    rankedName: hit.deck.name,
    rankedId: hit.deck.id,
    nameWasOverridden: Boolean(named && named.name !== hit.deck.name),
    namedMatch: named?.name ?? null,
    main: mainDiff,
    side: sideDiff,
  };
}

function formatOff(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Plain-text clinic for the copy button. */
export function clinicReportText(deckName: string, report: ListClinicReport): string {
  const lines: string[] = [];
  const field = report.rankedName
    ? `${report.rankedName} (${report.formatId ?? "?"} ${report.mode.toUpperCase()})`
    : "today’s ranked board";
  lines.push(`${deckName} vs ${field}`);
  if (report.emptyReason) {
    lines.push(report.emptyReason);
    return lines.join("\n");
  }
  const pushBoard = (label: string, b: BoardDiff) => {
    if (b.identical) {
      lines.push(`${label}: same ${b.rankedTotal}`);
      return;
    }
    lines.push(`${label}: ${formatOff(b.cardsOff)} card${b.cardsOff === 1 ? "" : "s"} off the ranked ${b.rankedTotal}`);
    for (const s of b.extras) lines.push(`  + you ${s.yours} ${s.name} (ranked 0)`);
    for (const s of b.counts) {
      const sign = s.yours > s.ranked ? "+" : "−";
      lines.push(`  ${sign} ${s.name} — you ${s.yours}, ranked ${s.ranked}`);
    }
    for (const s of b.missing) lines.push(`  − ranked ${s.ranked} ${s.name} (you 0)`);
  };
  pushBoard("Main", report.main);
  if (report.side) pushBoard("Side", report.side);
  lines.push("— Filthy Net Deck · real ranked lists only, no invented cards");
  return lines.join("\n");
}

function emptyBoard(): BoardDiff {
  return {
    cardsOff: 0,
    yoursTotal: 0,
    rankedTotal: 0,
    extras: [],
    missing: [],
    counts: [],
    identical: true,
  };
}

function emptyReport(mode: PlayMode, emptyReason: string): ListClinicReport {
  return {
    mode,
    formatId: null,
    rankedName: null,
    rankedId: null,
    nameWasOverridden: false,
    namedMatch: null,
    main: emptyBoard(),
    side: null,
    emptyReason,
  };
}
