/**
 * Deterministic "coach" chips — no LLM. Every claim ties to real match
 * aggregates or today's ranked meta lists (Brew Lab peer staples only).
 */

import type { Deck, MetaBundle } from "../types/meta";
import type { TrackedMatch } from "../types/tracker";
import { sideboardSplit, pct } from "./gameAnalytics";
import type { NameResolver } from "./opponentArchetype";
import { personalVsOpponentArchetypes } from "./opponentArchetype";
import { decksForMode } from "./deckHelpers";
import { formExtremes } from "./statsHelpers";
import { deckKey } from "./tracker";

export type CoachKind = "warning" | "good" | "neutral";

export interface CoachChip {
  id: string;
  kind: CoachKind;
  label: string;
  detail: string;
  /** Optional navigation hint for UI. */
  nav?: "stats" | "matchups" | "daily" | "climb";
}

/**
 * Up to 3 grounded chips from personal history + today's meta.
 */
export function buildLocalCoachChips(input: {
  matches: TrackedMatch[];
  meta: MetaBundle | null;
  resolveName: NameResolver;
  mode?: "bo1" | "bo3";
}): CoachChip[] {
  const chips: CoachChip[] = [];
  const matches = input.matches;
  const decided = matches.filter((m) => m.result === "win" || m.result === "loss");
  if (decided.length < 5) return chips;

  const meta = input.meta;
  const mode = input.mode ?? "bo3";
  let candidates: Deck[] = [];
  let topMeta: Deck | null = null;
  if (meta) {
    const fmt = meta.formats.find((f) => f.featured) ?? meta.formats[0];
    if (fmt) {
      candidates = decksForMode(fmt, mode, meta.decks);
      topMeta = candidates[0] ?? null;
    }
  }

  // 1) Cold vs field's #1 (B1 personal MU)
  if (topMeta && candidates.length) {
    const rows = personalVsOpponentArchetypes(
      matches,
      input.resolveName,
      candidates,
      { minHits: 2, minConfidence: 0.3, minGames: 3 },
    );
    const vsTop = rows.find(
      (r) =>
        r.archetype === topMeta!.archetype ||
        r.archetype === topMeta!.name ||
        r.deckId === topMeta!.id,
    );
    if (vsTop && vsTop.winrate != null && vsTop.winrate < 0.4) {
      chips.push({
        id: "cold-vs-top",
        kind: "warning",
        label: `Cold vs ${vsTop.archetype}`,
        detail: `${vsTop.wins}–${vsTop.losses} (${pct(vsTop.winrate)}) · field #1 on today's board`,
        nav: "stats",
      });
    } else if (vsTop && vsTop.winrate != null && vsTop.winrate >= 0.6) {
      chips.push({
        id: "hot-vs-top",
        kind: "good",
        label: `Crushing ${vsTop.archetype}`,
        detail: `${vsTop.wins}–${vsTop.losses} (${pct(vsTop.winrate)}) · field #1`,
        nav: "stats",
      });
    }
  }

  // 2) Sideboard signal (Bo3 only)
  const side = sideboardSplit(matches);
  if (side.matchesConsidered >= 3 && side.delta != null && Math.abs(side.delta) >= 0.08) {
    chips.push({
      id: "sideboard",
      kind: side.delta > 0 ? "good" : "warning",
      label: side.delta > 0 ? "Boards well" : "Boards poorly",
      detail: `G1 ${pct(side.g1.rate)} → post ${pct(side.post.rate)} (${side.matchesConsidered} Bo3 matches)`,
      nav: "stats",
    });
  }

  // 3) Form extremes
  const extremes = formExtremes(decided, 10);
  if (extremes.worst && extremes.worst.rate <= 0.3 && chips.length < 3) {
    chips.push({
      id: "cold-stretch",
      kind: "warning",
      label: "Cold stretch",
      detail: `Worst 10 · ${Math.round(extremes.worst.rate * 100)}% (${extremes.worst.wins}–${extremes.worst.losses})`,
      nav: "stats",
    });
  } else if (extremes.best && extremes.best.rate >= 0.7 && chips.length < 3) {
    chips.push({
      id: "hot-stretch",
      kind: "good",
      label: "Hot stretch",
      detail: `Best 10 · ${Math.round(extremes.best.rate * 100)}% (${extremes.best.wins}–${extremes.best.losses})`,
      nav: "climb",
    });
  }

  // 4) Most-played deck note
  if (chips.length < 3) {
    const by = new Map<string, { name: string; n: number; w: number; l: number }>();
    for (const m of decided) {
      const k = deckKey(m);
      const r = by.get(k) ?? {
        name: m.deckName?.trim() || "Unknown",
        n: 0,
        w: 0,
        l: 0,
      };
      r.n++;
      if (m.result === "win") r.w++;
      else r.l++;
      if (m.deckName?.trim()) r.name = m.deckName.trim();
      by.set(k, r);
    }
    const top = [...by.values()].sort((a, b) => b.n - a.n)[0];
    if (top && top.n >= 8) {
      const rate = top.w / (top.w + top.l);
      chips.push({
        id: "main-deck",
        kind: rate >= 0.55 ? "good" : rate <= 0.45 ? "warning" : "neutral",
        label: `Main list: ${top.name}`,
        detail: `${top.w}–${top.l} (${Math.round(rate * 100)}%) over ${top.n} games`,
        nav: "stats",
      });
    }
  }

  return chips.slice(0, 3);
}
