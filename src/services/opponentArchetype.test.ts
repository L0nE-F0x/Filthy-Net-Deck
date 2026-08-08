import { describe, expect, it } from "vitest";
import type { Deck, ManaColor } from "../types/meta";
import {
  archetypeTheme,
  cmcFromManaCost,
  colorGroupName,
  colorsFromManaCost,
  confidenceFromHits,
  formatGuessLabel,
  inferOpponentArchetype,
  normalizeCardName,
  observedColorsFromSeenCards,
  personalVsOpponentArchetypes,
  scoreDeckAgainstSeen,
  selectOpponentSeenGrpIds,
  type SeenCardInfo,
} from "./opponentArchetype";
import type { TrackedMatch } from "../types/tracker";

function deck(
  id: string,
  archetype: string,
  cards: { name: string; land?: boolean }[],
  keyCards: string[] = [],
): Deck {
  return {
    id,
    name: archetype,
    format: "standard",
    mode: "bo1",
    tier: 1,
    colors: ["U", "R"],
    archetype,
    description: "",
    mainboard: cards.map((c) => ({ count: 4, name: c.name, land: c.land })),
    sideboard: [],
    matchups: [],
    sideboardGuide: [],
    arenaImport: "",
    sources: [],
    keyCards,
  };
}

const izzet = deck(
  "std-izzet",
  "Izzet Prowess",
  [
    { name: "Monastery Swiftspear" },
    { name: "Slickshot Show-Off" },
    { name: "Play with Fire" },
    { name: "Mountain", land: true },
    { name: "Spirebluff Canal", land: true },
  ],
  ["Monastery Swiftspear", "Slickshot Show-Off"],
);

const domain = deck("std-domain", "Domain", [
  { name: "Leyline Binding" },
  { name: "Heron of Redemption" },
  { name: "Atraxa, Grand Unifier" },
  { name: "Forest", land: true },
]);

const names: Record<number, string> = {
  1: "Monastery Swiftspear",
  2: "Slickshot Show-Off",
  3: "Play with Fire",
  4: "Mountain",
  9: "Leyline Binding",
  10: "Atraxa, Grand Unifier",
};

const resolve = (id: number) => names[id] ?? null;

describe("normalizeCardName", () => {
  it("uses front face of DFCs", () => {
    expect(normalizeCardName("Picklock Prankster // Free the Fae")).toBe(
      "picklock prankster",
    );
  });
});

describe("scoreDeckAgainstSeen", () => {
  it("scores distinctive hits higher than lands", () => {
    const seen = new Set([
      normalizeCardName("Monastery Swiftspear"),
      normalizeCardName("Mountain"),
    ]);
    const s = scoreDeckAgainstSeen(seen, izzet);
    expect(s.distinctiveHits).toBe(1);
    expect(s.hits.length).toBe(2);
  });

  it("weights exclusive cards above shared staples (Lessons problem)", () => {
    const jeskaiLessons = deck(
      "jl",
      "Jeskai Lessons",
      [
        { name: "Jeskai Revelation" },
        { name: "Tablet of Discovery" },
        { name: "Accumulate Wisdom" },
        { name: "Island", land: true },
      ],
      ["Jeskai Revelation", "Tablet of Discovery", "Accumulate Wisdom"],
    );
    const izzetLessons = deck(
      "il",
      "Izzet Lessons",
      [
        { name: "Gran-Gran" },
        { name: "Tablet of Discovery" },
        { name: "Questing Druid" },
        { name: "Island", land: true },
      ],
      ["Gran-Gran", "Tablet of Discovery", "Questing Druid"],
    );
    const control = deck(
      "4c",
      "4c Control",
      [
        { name: "Inevitable Defeat" },
        { name: "Jeskai Revelation" },
        { name: "Tablet of Discovery" },
        { name: "Island", land: true },
      ],
      ["Inevitable Defeat", "Jeskai Revelation", "Tablet of Discovery"],
    );
    const field = [jeskaiLessons, izzetLessons, control];
    // Only shared Lesson staple + Izzet exclusive → must be Izzet Lessons.
    const names2: Record<number, string> = {
      20: "Tablet of Discovery",
      21: "Gran-Gran",
      22: "Questing Druid",
      30: "Inevitable Defeat",
      31: "Jeskai Revelation",
    };
    const r = (id: number) => names2[id] ?? null;
    const izz = inferOpponentArchetype([20, 21, 22], r, field, {
      minHits: 2,
      minConfidence: 0.2,
    });
    expect(izz?.archetype).toBe("Izzet Lessons");

    const ctrl = inferOpponentArchetype([20, 30, 31], r, field, {
      minHits: 2,
      minConfidence: 0.2,
    });
    expect(ctrl?.archetype).toBe("4c Control");
  });
});

describe("inferOpponentArchetype", () => {
  it("picks the deck with more signature hits", () => {
    const guess = inferOpponentArchetype([1, 2, 3], resolve, [izzet, domain], {
      minHits: 2,
      minConfidence: 0.2,
    });
    expect(guess?.archetype).toBe("Izzet Prowess");
    expect(guess!.distinctiveHits).toBeGreaterThanOrEqual(2);
  });

  it("returns null when evidence is thin", () => {
    const guess = inferOpponentArchetype([4], resolve, [izzet, domain]);
    expect(guess).toBeNull();
  });

  it("returns null without names", () => {
    expect(inferOpponentArchetype([99], () => null, [izzet])).toBeNull();
  });
});

describe("personalVsOpponentArchetypes", () => {
  it("aggregates WR by inferred archetype", () => {
    const matches: TrackedMatch[] = [
      {
        matchId: "a",
        startedAt: 1,
        endedAt: 2,
        eventId: "Ladder",
        bestOf: 1,
        myTeamId: 1,
        games: [],
        result: "win",
        opponentSeen: [1, 2, 3],
      },
      {
        matchId: "b",
        startedAt: 3,
        endedAt: 4,
        eventId: "Ladder",
        bestOf: 1,
        myTeamId: 1,
        games: [],
        result: "loss",
        opponentSeen: [1, 2],
      },
      {
        matchId: "c",
        startedAt: 5,
        endedAt: 6,
        eventId: "Ladder",
        bestOf: 1,
        myTeamId: 1,
        games: [],
        result: "win",
        opponentSeen: [9, 10],
      },
    ];
    const rows = personalVsOpponentArchetypes(matches, resolve, [izzet, domain], {
      minHits: 2,
      minConfidence: 0.2,
    });
    const izz = rows.find((r) => r.archetype === "Izzet Prowess");
    expect(izz?.wins).toBe(1);
    expect(izz?.losses).toBe(1);
    expect(izz?.form).toBe("WL"); // chronological win then loss
    const dom = rows.find((r) => r.archetype === "Domain");
    expect(dom?.wins).toBe(1);
    expect(dom?.form).toBe("W");
  });
});

describe("helpers", () => {
  it("formats label", () => {
    expect(
      formatGuessLabel({
        archetype: "Izzet Prowess",
        deckId: "x",
        hits: ["a", "b"],
        distinctiveHits: 2,
        confidence: 0.72,
        poolSize: 5,
        baseArchetype: "Izzet Prowess",
        colorAdjusted: false,
        observedColors: [],
      }),
    ).toBe("Izzet Prowess · 72%");
  });

  it("confidence is 0 without hits", () => {
    expect(confidenceFromHits(0, 5, 3)).toBe(0);
  });
});

describe("selectOpponentSeenGrpIds", () => {
  const mk = (
    opponentSeen: number[] | undefined,
    endedAt: number,
    bestOf = 1,
  ): Pick<TrackedMatch, "opponentSeen" | "endedAt" | "bestOf"> => ({
    opponentSeen,
    endedAt,
    bestOf,
  });

  it("returns an empty selection when nothing was seen", () => {
    const sel = selectOpponentSeenGrpIds([mk([], 10), mk(undefined, 20)], "recent");
    expect(sel.grpIds).toEqual([]);
    expect(sel.seenMatchCount).toBe(0);
    expect(sel.sourceEndedAt).toBeNull();
  });

  it("recent scope uses only the freshest match with cards", () => {
    const sel = selectOpponentSeenGrpIds(
      [mk([1, 2], 100, 3), mk([5, 6], 200, 1), mk([], 300)],
      "recent",
    );
    expect(sel.grpIds).toEqual([5, 6]);
    expect(sel.matchCount).toBe(1);
    expect(sel.seenMatchCount).toBe(2);
    expect(sel.sourceEndedAt).toBe(200);
    expect(sel.sourceBestOf).toBe(1);
  });

  it("all scope unions every match, deduped, freshest first", () => {
    const sel = selectOpponentSeenGrpIds(
      [mk([1, 2], 100, 3), mk([2, 5], 200, 1)],
      "all",
    );
    // Freshest match (endedAt 200) contributes first; 2 is deduped.
    expect(sel.grpIds).toEqual([2, 5, 1]);
    expect(sel.matchCount).toBe(2);
    expect(sel.sourceBestOf).toBe(1); // from freshest match
  });
});

/** Deck builder with explicit colors — color reads are the point below. */
function coloredDeck(
  id: string,
  archetype: string,
  colors: ManaColor[],
  cards: { name: string; land?: boolean }[],
  keyCards: string[] = [],
): Deck {
  return { ...deck(id, archetype, cards, keyCards), colors };
}

describe("color evidence", () => {
  it("reads hard colors from plain pips, soft from hybrids", () => {
    expect([...colorsFromManaCost("{2}{W}{B}").hard].sort()).toEqual(["B", "W"]);
    const hybrid = colorsFromManaCost("{W/B}{2/R}{G/P}");
    expect([...hybrid.hard]).toEqual([]);
    expect([...hybrid.soft].sort()).toEqual(["B", "G", "R", "W"]);
  });

  it("mono-colored lands prove a color, duals only hint", () => {
    const cards: SeenCardInfo[] = [
      { name: "Swamp", isLand: true, colorIdentity: ["B"] },
      { name: "Godless Shrine", isLand: true, colorIdentity: ["W", "B"] },
      { name: "Plains", isLand: true, colorIdentity: ["W"] },
    ];
    const ev = observedColorsFromSeenCards(cards);
    expect([...ev.required].sort()).toEqual(["B", "W"]);
    expect([...ev.soft]).toEqual([]);
  });

  it("names color groups and strips color words from archetypes", () => {
    expect(colorGroupName(["W", "B"])).toBe("Orzhov");
    expect(colorGroupName(["W"])).toBe("Mono-White");
    expect(colorGroupName(["W", "U", "B", "R"])).toBe("4c");
    expect(archetypeTheme("Mono-White Lifegain")).toBe("Lifegain");
    expect(archetypeTheme("Jeskai Lessons")).toBe("Lessons");
    expect(archetypeTheme("Domain")).toBeNull();
  });
});

describe("off-color opponents (Orzhov Lifegain bug)", () => {
  const monoWhiteLifegain = coloredDeck(
    "std-mww",
    "Mono-White Lifegain",
    ["W"],
    [
      { name: "Sheltered by Ghosts" },
      { name: "Anointed Chorister" },
      { name: "Enduring Innocence" },
      { name: "Plains", land: true },
    ],
    ["Sheltered by Ghosts", "Enduring Innocence"],
  );
  const monoBlackDemons = coloredDeck(
    "std-mbd",
    "Mono-Black Demons",
    ["B"],
    [
      { name: "Unholy Annex" },
      { name: "Liliana of the Veil" },
      { name: "Swamp", land: true },
    ],
    ["Unholy Annex"],
  );
  const field = [monoWhiteLifegain, monoBlackDemons];

  const cards: Record<number, SeenCardInfo> = {
    1: { name: "Sheltered by Ghosts", manaCost: "{1}{W}", typeLine: "Enchantment — Aura" },
    2: { name: "Enduring Innocence", manaCost: "{2}{W}", typeLine: "Creature — Sheep" },
    3: { name: "Plains", isLand: true, typeLine: "Basic Land — Plains", colorIdentity: ["W"] },
    // Off-list black card the ranked field has never heard of.
    4: { name: "Cut Down", manaCost: "{B}", typeLine: "Instant" },
    5: { name: "Swamp", isLand: true, typeLine: "Basic Land — Swamp", colorIdentity: ["B"] },
  };
  const resolveCard = (id: number) => cards[id] ?? null;
  const opts = { minHits: 2, minConfidence: 0.2 };

  it("relabels a mono-white shell as Orzhov once black mana is proven", () => {
    const guess = inferOpponentArchetype([1, 2, 3, 4, 5], resolveCard, field, opts);
    expect(guess?.archetype).toBe("Orzhov Lifegain");
    expect(guess?.baseArchetype).toBe("Mono-White Lifegain");
    expect(guess?.colorAdjusted).toBe(true);
    expect(guess?.observedColors).toEqual(["W", "B"]);
    // Still the closest ranked list — that's what we compare/copy against.
    expect(guess?.deckId).toBe("std-mww");
  });

  it("leaves an on-color read alone", () => {
    const guess = inferOpponentArchetype([1, 2, 3], resolveCard, field, opts);
    expect(guess?.archetype).toBe("Mono-White Lifegain");
    expect(guess?.colorAdjusted).toBe(false);
  });

  it("prefers a list that can actually cast what was seen", () => {
    const orzhovLifegain = coloredDeck(
      "std-wb",
      "Orzhov Lifegain",
      ["W", "B"],
      [
        { name: "Sheltered by Ghosts" },
        { name: "Enduring Innocence" },
        { name: "Unholy Annex" },
        { name: "Swamp", land: true },
      ],
      ["Sheltered by Ghosts", "Unholy Annex"],
    );
    const guess = inferOpponentArchetype(
      [1, 2, 5],
      resolveCard,
      [monoWhiteLifegain, orzhovLifegain],
      opts,
    );
    expect(guess?.deckId).toBe("std-wb");
    expect(guess?.colorAdjusted).toBe(false);
  });

  it("name-only resolvers keep the old behaviour", () => {
    const byName = (id: number) => cards[id]?.name ?? null;
    const guess = inferOpponentArchetype([1, 2, 3, 4, 5], byName, field, opts);
    expect(guess?.archetype).toBe("Mono-White Lifegain");
    expect(guess?.colorAdjusted).toBe(false);
  });
});

describe("macro fallback (off-meta opponents)", () => {
  it("parses rough mana values from cost strings", () => {
    expect(cmcFromManaCost("{2}{W}{B}")).toBe(4);
    expect(cmcFromManaCost("{X}{U}{U}")).toBe(2);
    expect(cmcFromManaCost("{W/B}")).toBe(1);
    expect(cmcFromManaCost("{0}")).toBe(0);
    expect(cmcFromManaCost(undefined)).toBeNull();
    expect(cmcFromManaCost("")).toBeNull();
  });

  // None of these candidates share a card with the seen sets below.
  const unrelatedField = [
    coloredDeck(
      "std-domain",
      "Domain",
      ["W", "U", "B", "R", "G"],
      [
        { name: "Leyline Binding" },
        { name: "Atraxa, Grand Unifier" },
        { name: "Forest", land: true },
      ],
      ["Leyline Binding"],
    ),
  ];
  const opts = { minHits: 2, minConfidence: 0.35 };

  const redAggroCards: Record<number, SeenCardInfo> = {
    1: { name: "Monastery Swiftspear", manaCost: "{R}", typeLine: "Creature — Human Monk" },
    2: { name: "Emberheart Challenger", manaCost: "{1}{R}", typeLine: "Creature — Mouse Warrior" },
    3: { name: "Slickshot Show-Off", manaCost: "{1}{R}", typeLine: "Creature — Lizard Wizard" },
    4: { name: "Play with Fire", manaCost: "{R}", typeLine: "Instant" },
    5: { name: "Lightning Strike", manaCost: "{1}{R}", typeLine: "Instant" },
    6: { name: "Mountain", isLand: true, typeLine: "Basic Land — Mountain", colorIdentity: ["R"] },
  };

  it("labels an off-meta red rush as Mono-Red Aggro", () => {
    const guess = inferOpponentArchetype(
      [1, 2, 3, 4, 5, 6],
      (id) => redAggroCards[id] ?? null,
      unrelatedField,
      opts,
    );
    expect(guess?.archetype).toBe("Mono-Red Aggro");
    expect(guess?.macroFallback).toBe(true);
    expect(guess?.deckId).toBe("");
    expect(guess?.confidence).toBeGreaterThanOrEqual(0.35);
    expect(guess?.confidence).toBeLessThanOrEqual(0.5);
    expect(guess?.observedColors).toEqual(["R"]);
  });

  it("labels counters + sweepers + draw as Azorius Control", () => {
    const controlCards: Record<number, SeenCardInfo> = {
      1: { name: "Spell Pierce", manaCost: "{U}", typeLine: "Instant" },
      2: { name: "Negate", manaCost: "{1}{U}", typeLine: "Instant" },
      3: { name: "Temporary Lockdown", manaCost: "{1}{W}{W}", typeLine: "Enchantment" },
      4: { name: "Memory Deluge", manaCost: "{2}{U}{U}", typeLine: "Instant" },
      5: { name: "Island", isLand: true, typeLine: "Basic Land — Island", colorIdentity: ["U"] },
      6: { name: "Plains", isLand: true, typeLine: "Basic Land — Plains", colorIdentity: ["W"] },
    };
    const guess = inferOpponentArchetype(
      [1, 2, 3, 4, 5, 6],
      (id) => controlCards[id] ?? null,
      unrelatedField,
      opts,
    );
    expect(guess?.archetype).toBe("Azorius Control");
    expect(guess?.macroFallback).toBe(true);
  });

  it("still prefers a real list when one matches", () => {
    const monoRed = coloredDeck(
      "std-red",
      "Mono-Red Prowess",
      ["R"],
      [
        { name: "Monastery Swiftspear" },
        { name: "Emberheart Challenger" },
        { name: "Slickshot Show-Off" },
        { name: "Play with Fire" },
        { name: "Lightning Strike" },
        { name: "Mountain", land: true },
      ],
      ["Monastery Swiftspear", "Slickshot Show-Off"],
    );
    const guess = inferOpponentArchetype(
      [1, 2, 3, 4, 5, 6],
      (id) => redAggroCards[id] ?? null,
      [...unrelatedField, monoRed],
      opts,
    );
    expect(guess?.deckId).toBe("std-red");
    expect(guess?.macroFallback).toBeFalsy();
  });

  it("stays silent on thin evidence (fewer than 4 non-land cards)", () => {
    const guess = inferOpponentArchetype(
      [1, 4, 6],
      (id) => redAggroCards[id] ?? null,
      unrelatedField,
      opts,
    );
    expect(guess).toBeNull();
  });

  it("stays silent when no color can be proven", () => {
    const colorless: Record<number, SeenCardInfo> = {
      1: { name: "Ornithopter", manaCost: "{0}", typeLine: "Artifact Creature — Thopter" },
      2: { name: "Steel Overseer", manaCost: "{2}", typeLine: "Artifact Creature — Construct" },
      3: { name: "Mystic Forge", manaCost: "{4}", typeLine: "Artifact" },
      4: { name: "Darksteel Citadel", isLand: true, typeLine: "Artifact Land", colorIdentity: [] },
      5: { name: "Warping Wail", manaCost: "{1}{C}", typeLine: "Instant" },
    };
    const guess = inferOpponentArchetype(
      [1, 2, 3, 4, 5],
      (id) => colorless[id] ?? null,
      unrelatedField,
      opts,
    );
    expect(guess).toBeNull();
  });

  it("can be disabled per call", () => {
    const guess = inferOpponentArchetype(
      [1, 2, 3, 4, 5, 6],
      (id) => redAggroCards[id] ?? null,
      unrelatedField,
      { ...opts, macroFallback: false },
    );
    expect(guess).toBeNull();
  });
});
