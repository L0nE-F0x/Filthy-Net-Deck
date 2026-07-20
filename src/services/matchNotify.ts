/**
 * Pure match-end toast body — richer when B1 archetype + personal MU exist.
 */

import type { Deck } from "../types/meta";
import type { TrackedMatch } from "../types/tracker";
import {
  inferOpponentArchetype,
  type NameResolver,
} from "./opponentArchetype";
import { deckKey, seasonKeyOf } from "./tracker";

export function matchEndToastBody(
  m: TrackedMatch,
  history: TrackedMatch[],
  opts?: {
    resolveName?: NameResolver;
    candidates?: Deck[];
  },
): string {
  const result =
    m.result === "win"
      ? "Win"
      : m.result === "loss"
        ? "Loss"
        : m.result === "draw"
          ? "Draw"
          : "Match";
  const opp = m.opponentName?.trim() || "opponent";
  const bits: string[] = [`${result} vs ${opp}`];

  // Season WR on this deck
  const season = seasonKeyOf(m.endedAt);
  const deck = deckKey(m);
  const seasonDeck = history.filter(
    (x) =>
      seasonKeyOf(x.endedAt) === season &&
      deckKey(x) === deck &&
      (x.result === "win" || x.result === "loss"),
  );
  const wins = seasonDeck.filter((x) => x.result === "win").length;
  const losses = seasonDeck.filter((x) => x.result === "loss").length;
  const decided = wins + losses;
  if (decided > 0) {
    bits.push(`${Math.round((wins / decided) * 100)}% this season`);
  }

  // B1 guess + personal MU vs that archetype (min 2 samples including this match)
  const resolve = opts?.resolveName;
  const cands = opts?.candidates;
  if (resolve && cands?.length && m.opponentSeen?.length) {
    const guess = inferOpponentArchetype(m.opponentSeen, resolve, cands, {
      minHits: 2,
      minConfidence: 0.3,
    });
    if (guess) {
      bits.push(guess.archetype);
      const vs = history.filter((x) => {
        if (x.result !== "win" && x.result !== "loss") return false;
        if (!x.opponentSeen?.length) return false;
        const g = inferOpponentArchetype(x.opponentSeen, resolve, cands, {
          minHits: 2,
          minConfidence: 0.3,
        });
        return g?.archetype === guess.archetype;
      });
      const vw = vs.filter((x) => x.result === "win").length;
      const vl = vs.filter((x) => x.result === "loss").length;
      if (vw + vl >= 2) bits.push(`you ${vw}–${vl}`);
    }
  }

  return bits.join(" · ");
}
