/**
 * Pure My Stats insights — chips, season story, two-deck compare.
 */

import type { TrackedMatch } from "../types/tracker";
import { deckKey, seasonKeyOf } from "./tracker";
import { parseRank, type ParsedRank } from "./ranks";
import { formExtremes, tallyMatches } from "./statsHelpers";
import { gamePlayDrawSplit } from "./gameAnalytics";

export interface InsightChip {
  id: string;
  label: string;
  detail: string;
  /** Tracker deck key to open, when applicable. */
  deckKey?: string;
  kind: "warning" | "good" | "neutral";
}

function tally(matches: TrackedMatch[]) {
  const t = tallyMatches(matches);
  return { wins: t.wins, losses: t.losses, decided: t.decided };
}

/** Insight chips for Stats home (clickable when deckKey set). */
export function buildInsightChips(
  matches: TrackedMatch[],
  opts?: { seasonKey?: string | null },
): InsightChip[] {
  const season = opts?.seasonKey;
  const pool =
    season && season !== "all"
      ? matches.filter((m) => seasonKeyOf(m.endedAt) === season)
      : matches;
  const decided = pool.filter((m) => m.result === "win" || m.result === "loss");
  if (!decided.length) return [];

  const chips: InsightChip[] = [];

  // Worst WR among decks with ≥5 decided games
  const byDeck = new Map<string, TrackedMatch[]>();
  for (const m of decided) {
    const k = deckKey(m);
    const list = byDeck.get(k) ?? [];
    list.push(m);
    byDeck.set(k, list);
  }
  let worst: { key: string; name: string; rate: number; n: number } | null = null;
  let best: { key: string; name: string; rate: number; n: number } | null = null;
  for (const [key, list] of byDeck) {
    const t = tally(list);
    if (t.decided < 5) continue;
    const rate = t.wins / t.decided;
    const name = list.find((m) => m.deckName)?.deckName ?? "Unknown deck";
    if (!worst || rate < worst.rate) worst = { key, name, rate, n: t.decided };
    if (!best || rate > best.rate) best = { key, name, rate, n: t.decided };
  }
  if (worst && worst.rate < 0.45) {
    chips.push({
      id: "worst-deck",
      label: "Cold deck",
      detail: `${worst.name} · ${(worst.rate * 100).toFixed(0)}% (${worst.n}g)`,
      deckKey: worst.key,
      kind: "warning",
    });
  }
  if (best && best.rate >= 0.55) {
    chips.push({
      id: "hot-deck",
      label: "Hot deck",
      detail: `${best.name} · ${(best.rate * 100).toFixed(0)}% (${best.n}g)`,
      deckKey: best.key,
      kind: "good",
    });
  }

  // Game-level play/draw gap (every stamped game — B2, not g1-only proxy)
  const pd = gamePlayDrawSplit(decided);
  if (pd.play.games >= 5 && pd.draw.games >= 5 && pd.gap != null && Math.abs(pd.gap) >= 0.08) {
    chips.push({
      id: "play-draw",
      label: pd.gap > 0 ? "Play-skewed" : "Draw-skewed",
      detail: `Play ${((pd.play.rate ?? 0) * 100).toFixed(0)}% · Draw ${((pd.draw.rate ?? 0) * 100).toFixed(0)}% · game-level`,
      kind: "neutral",
    });
  }

  // Best / worst 10-match form stretch
  const extremes = formExtremes(decided, 10);
  if (extremes.best && extremes.best.rate >= 0.7) {
    chips.push({
      id: "best-form",
      label: "Hot stretch",
      detail: `Best 10 · ${Math.round(extremes.best.rate * 100)}% (${extremes.best.wins}–${extremes.best.losses})`,
      kind: "good",
    });
  }
  if (extremes.worst && extremes.worst.rate <= 0.3) {
    chips.push({
      id: "worst-form",
      label: "Cold stretch",
      detail: `Worst 10 · ${Math.round(extremes.worst.rate * 100)}% (${extremes.worst.wins}–${extremes.worst.losses})`,
      kind: "warning",
    });
  }

  // Loss streak deck (current run of losses — which deck)
  const newestFirst = [...decided].sort((a, b) => b.endedAt - a.endedAt);
  if (newestFirst[0]?.result === "loss") {
    let run = 0;
    for (const m of newestFirst) {
      if (m.result === "loss") run++;
      else break;
    }
    if (run >= 3) {
      const d = newestFirst[0];
      chips.push({
        id: "loss-streak",
        label: `${run}L streak`,
        detail: d.deckName?.trim() || "Unknown deck",
        deckKey: deckKey(d),
        kind: "warning",
      });
    }
  }

  return chips.slice(0, 6);
}

export interface SeasonStory {
  seasonKey: string;
  games: number;
  wins: number;
  losses: number;
  rate: number | null;
  peakRank: ParsedRank | null;
  bestDeckName: string | null;
  bestDeckKey: string | null;
  bestDeckRate: number | null;
}

export function buildSeasonStory(
  matches: TrackedMatch[],
  seasonKey: string,
): SeasonStory {
  const pool =
    seasonKey === "all"
      ? matches
      : matches.filter((m) => seasonKeyOf(m.endedAt) === seasonKey);
  const t = tally(pool);
  let peak: ParsedRank | null = null;
  for (const m of pool) {
    const r = parseRank(m.myRank);
    if (!r) continue;
    if (!peak || r.score > peak.score) peak = r;
  }

  const byDeck = new Map<string, TrackedMatch[]>();
  for (const m of pool) {
    if (m.result !== "win" && m.result !== "loss") continue;
    const k = deckKey(m);
    const list = byDeck.get(k) ?? [];
    list.push(m);
    byDeck.set(k, list);
  }
  let bestDeckName: string | null = null;
  let bestDeckKey: string | null = null;
  let bestDeckRate: number | null = null;
  for (const [key, list] of byDeck) {
    const tt = tally(list);
    if (tt.decided < 3) continue;
    const rate = tt.wins / tt.decided;
    if (bestDeckRate == null || rate > bestDeckRate) {
      bestDeckRate = rate;
      bestDeckKey = key;
      bestDeckName = list.find((m) => m.deckName)?.deckName ?? "Unknown deck";
    }
  }

  return {
    seasonKey,
    games: pool.length,
    wins: t.wins,
    losses: t.losses,
    rate: t.decided ? t.wins / t.decided : null,
    peakRank: peak,
    bestDeckName,
    bestDeckKey,
    bestDeckRate,
  };
}

export interface DeckCompareSide {
  key: string;
  name: string;
  wins: number;
  losses: number;
  rate: number | null;
  playRate: number | null;
  drawRate: number | null;
  form10: number | null;
  peakRank: ParsedRank | null;
}

export interface DeckCompareResult {
  a: DeckCompareSide;
  b: DeckCompareSide;
}

function sideFromMatches(key: string, list: TrackedMatch[]): DeckCompareSide {
  const t = tally(list.filter((m) => m.result === "win" || m.result === "loss"));
  let playW = 0,
    playN = 0,
    drawW = 0,
    drawN = 0;
  for (const m of list) {
    if (m.result !== "win" && m.result !== "loss") continue;
    const g1 = m.games[0];
    if (!g1 || g1.onPlay == null) continue;
    if (g1.onPlay) {
      playN++;
      if (m.result === "win") playW++;
    } else {
      drawN++;
      if (m.result === "win") drawW++;
    }
  }
  const last10 = [...list]
    .filter((m) => m.result === "win" || m.result === "loss")
    .sort((a, b) => b.endedAt - a.endedAt)
    .slice(0, 10);
  const f = tally(last10);
  let peak: ParsedRank | null = null;
  for (const m of list) {
    const r = parseRank(m.myRank);
    if (!r) continue;
    if (!peak || r.score > peak.score) peak = r;
  }
  return {
    key,
    name: list.find((m) => m.deckName)?.deckName ?? "Unknown deck",
    wins: t.wins,
    losses: t.losses,
    rate: t.decided ? t.wins / t.decided : null,
    playRate: playN ? playW / playN : null,
    drawRate: drawN ? drawW / drawN : null,
    form10: f.decided ? f.wins / f.decided : null,
    peakRank: peak,
  };
}

export function compareDecks(
  matches: TrackedMatch[],
  keyA: string,
  keyB: string,
): DeckCompareResult | null {
  if (!keyA || !keyB || keyA === keyB) return null;
  const aList = matches.filter((m) => deckKey(m) === keyA);
  const bList = matches.filter((m) => deckKey(m) === keyB);
  if (!aList.length || !bList.length) return null;
  return {
    a: sideFromMatches(keyA, aList),
    b: sideFromMatches(keyB, bList),
  };
}

/** Your W–L vs opponents tagged with this archetype name (from notes store values). */
export function recordVsArchetypeTag(
  matches: TrackedMatch[],
  tag: string,
  notesByOpponentKey: Record<string, { tag?: string }>,
  opponentKeyFn: (name: string | undefined | null) => string,
): { wins: number; losses: number; rate: number | null } {
  const want = tag.trim().toLowerCase();
  let wins = 0;
  let losses = 0;
  for (const m of matches) {
    const note = notesByOpponentKey[opponentKeyFn(m.opponentName)];
    if (!note?.tag || note.tag.trim().toLowerCase() !== want) continue;
    if (m.result === "win") wins++;
    else if (m.result === "loss") losses++;
  }
  const decided = wins + losses;
  return { wins, losses, rate: decided ? wins / decided : null };
}
