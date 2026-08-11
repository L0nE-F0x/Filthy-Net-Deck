/**
 * Guard: a mono-coloured opponent must not read as a many-coloured pile.
 *
 * Written 2026-08-11 after a live report of an all-black opponent showing as
 * "4c Control" in the overlay. **These cases already pass** — the misread was
 * not reproducible from the scoring, and replaying the owner's real Player.log
 * showed inference naming Mono-Black Demons at 0.80 confidence from six real
 * cards. So this is a standing guard on behaviour we now depend on, not a fix
 * for a confirmed defect.
 *
 * It matters more than it used to: inference feeds the uploaded crowd data, so
 * a wrong archetype no longer just mislabels one overlay — it keys somebody's
 * match to the wrong cell in everyone's matchup table.
 *
 * Two real explanations for the live misread, neither a scoring bug:
 *  - The overlay infers from cards seen *so far*. Two or three cards into a
 *    game there is genuinely not enough evidence, and confidence is low.
 *  - "Mono-Black Midrange" is not in the field. The only mono-black candidate
 *    is Mono-Black Demons, so an off-meta black brew has no right answer
 *    available and the macro fallback has to carry it.
 */
import { describe, expect, it } from "vitest";
import { inferOpponentArchetype } from "./opponentArchetype";
import type { Deck } from "../types/meta";

function deck(
  id: string,
  archetype: string,
  colors: Deck["colors"],
  cards: { name: string; land?: boolean }[],
  keyCards: string[] = [],
): Deck {
  return {
    id,
    name: archetype,
    format: "standard",
    mode: "bo1",
    tier: 1,
    colors,
    archetype,
    description: "",
    mainboard: cards.map((c) => ({ count: 4, name: c.name, land: c.land })),
    sideboard: [],
    matchups: [],
    sideboardGuide: [],
    arenaImport: "",
    sources: [],
    keyCards,
  } as unknown as Deck;
}

/** Narrow, honest mono-black list. */
const monoBlack = deck(
  "mb",
  "Mono-Black Midrange",
  ["B"],
  [
    { name: "Swamp", land: true },
    { name: "Gloomlake Verge", land: true },
    { name: "Cut Down" },
    { name: "Go for the Throat" },
    { name: "Bloodletter of Aclazotz" },
    { name: "Preacher of the Schism" },
    { name: "Liliana of the Veil" },
  ],
  ["Bloodletter of Aclazotz", "Preacher of the Schism"],
);

/**
 * A wide pile that happens to include the same black removal. This is the
 * shape that used to win: more colours, bigger pool, more chances to match.
 */
const fourColour = deck(
  "4c",
  "4c Control",
  ["W", "U", "B", "R"],
  [
    { name: "Swamp", land: true },
    { name: "Raffine's Tower", land: true },
    { name: "Cut Down" },
    { name: "Go for the Throat" },
    { name: "Leyline Binding" },
    { name: "Teferi, Hero of Dominaria" },
    { name: "Lightning Helix" },
    { name: "Memory Deluge" },
    { name: "Beans" },
  ],
  ["Leyline Binding", "Teferi, Hero of Dominaria"],
);

const candidates = [monoBlack, fourColour];

/** grpId → name, mirroring how the app resolves Arena ids. */
function resolver(names: Record<number, string>) {
  return (id: number) => names[id] ?? null;
}

describe("mono-coloured opponent vs a wide pile", () => {
  it("names the mono-black deck when only black cards were shown", () => {
    const names = {
      1: "Swamp",
      2: "Gloomlake Verge",
      3: "Cut Down",
      4: "Go for the Throat",
      5: "Bloodletter of Aclazotz",
      6: "Preacher of the Schism",
    };
    const guess = inferOpponentArchetype([1, 2, 3, 4, 5, 6], resolver(names), candidates, {
      minConfidence: 0.35,
    });
    expect(guess?.archetype).toBe("Mono-Black Midrange");
  });

  it("does not pick the wide pile even on the shared removal alone", () => {
    // Only cards BOTH lists play. The mono deck should still win, because the
    // opponent has shown no evidence of the other three colours.
    const names = {
      1: "Swamp",
      2: "Cut Down",
      3: "Go for the Throat",
      4: "Swamp",
    };
    const guess = inferOpponentArchetype([1, 2, 3, 4], resolver(names), candidates, {
      minConfidence: 0.2,
      minHits: 1,
    });
    // Either the narrow deck, or an honest refusal / generic mono-black label —
    // but never the four-colour list.
    expect(guess?.archetype).not.toBe("4c Control");
  });

  it("still picks the wide pile once its own colours actually show up", () => {
    // Absence of evidence must not become proof of absence: show off-black
    // cards and the four-colour read should come back.
    const names = {
      1: "Leyline Binding",
      2: "Teferi, Hero of Dominaria",
      3: "Cut Down",
      4: "Raffine's Tower",
      5: "Memory Deluge",
    };
    const guess = inferOpponentArchetype([1, 2, 3, 4, 5], resolver(names), candidates, {
      minConfidence: 0.35,
    });
    expect(guess?.archetype).toBe("4c Control");
  });

  it("does not over-penalise on a tiny sample", () => {
    // One shared card is not enough to rule anything out. The guard must scale
    // with how much has been seen, or early-game reads become useless.
    const guess = inferOpponentArchetype(
      [1],
      resolver({ 1: "Cut Down" }),
      candidates,
      { minConfidence: 0.05, minHits: 1 },
    );
    // Whatever it says, it must not be confident on one card.
    if (guess) expect(guess.confidence).toBeLessThan(0.6);
  });
});
