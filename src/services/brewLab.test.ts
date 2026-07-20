import { describe, expect, it } from "vitest";
import type { Deck, MetaBundle } from "../types/meta";
import {
  averageShapes,
  buildFindings,
  clinicGrade,
  clinicReportText,
  fromCardEntries,
  fromNamedLines,
  peerStaples,
  runBrewClinic,
  shapeOf,
  type CountedName,
} from "./brewLab";

function card(
  name: string,
  count: number,
  extra: Partial<CountedName> = {},
): CountedName {
  return { name, count, ...extra };
}

function metaWithPeers(peers: Deck[]): MetaBundle {
  const decks: Record<string, Deck> = {};
  const ids: string[] = [];
  peers.forEach((d, i) => {
    const id = d.id || `d${i}`;
    ids.push(id);
    decks[id] = { ...d, id };
  });
  return {
    version: "test",
    date: "2026-07-20",
    generatedAt: "2026-07-20T00:00:00Z",
    formats: [
      {
        id: "standard",
        name: "Standard",
        shortLabel: "STD",
        featured: true,
        bo1DeckIds: ids,
        bo3DeckIds: ids,
        tiers: [],
        metaNotes: "",
      },
    ],
    decks,
    tournaments: [],
    sources: ["test"],
  };
}

const midrange = (name: string, id: string): Deck => ({
  id,
  name,
  format: "standard",
  mode: "bo1",
  tier: 1,
  colors: ["B", "G"],
  archetype: name,
  description: "",
  mainboard: [
    { name: "Forest", count: 10, land: true, type: "other", cmc: 0 },
    { name: "Swamp", count: 8, land: true, type: "other", cmc: 0 },
    { name: "Llanowar Elves", count: 4, type: "creature", cmc: 1 },
    { name: "Sheoldred", count: 3, type: "creature", cmc: 4 },
    { name: "Go for the Throat", count: 3, type: "instant", cmc: 2 },
    { name: "Duress", count: 2, type: "sorcery", cmc: 1 },
    { name: "Blooming Marsh", count: 4, land: true, cmc: 0 },
    { name: "Glissa Sunslayer", count: 3, type: "creature", cmc: 3 },
    { name: "Cut Down", count: 2, type: "instant", cmc: 1 },
    { name: "Mosswood Dreadknight", count: 4, type: "creature", cmc: 2 },
    { name: "Tranquil Frillback", count: 2, type: "creature", cmc: 3 },
    { name: "Gix's Command", count: 2, type: "sorcery", cmc: 5 },
    { name: "Restless Cottage", count: 2, land: true, cmc: 0 },
    { name: "Mirrex", count: 2, land: true, cmc: 0 },
    { name: "Other Land", count: 2, land: true, cmc: 0 },
    { name: "Filler Spell", count: 7, type: "sorcery", cmc: 2 },
  ],
  sideboard: [
    { name: "Duress", count: 2, type: "sorcery", cmc: 1 },
    { name: "Cut Down", count: 2, type: "instant", cmc: 1 },
  ],
  matchups: [],
  sideboardGuide: [],
  arenaImport: "",
  sources: [],
});

describe("shapeOf", () => {
  it("counts lands and creatures", () => {
    const s = shapeOf([
      card("Forest", 20, { land: true }),
      card("Bear", 16, { type: "creature", cmc: 2 }),
      card("Bolt", 4, { type: "instant", cmc: 1 }),
    ]);
    expect(s.total).toBe(40);
    expect(s.lands).toBe(20);
    expect(s.creatures).toBe(16);
    expect(s.instantSorcery).toBe(4);
    expect(s.curve[1]).toBe(4);
    expect(s.curve[2]).toBe(16);
  });
});

describe("peerStaples", () => {
  it("only surfaces cards that exist on peer lists", () => {
    const peers = [
      [card("Go for the Throat", 3, { type: "instant" }), card("Forest", 20, { land: true })],
      [card("Go for the Throat", 2, { type: "instant" }), card("Forest", 20, { land: true })],
      [card("Cut Down", 4, { type: "instant" }), card("Forest", 20, { land: true })],
    ];
    const yours = [card("Forest", 20, { land: true })];
    const staples = peerStaples(peers, yours, { minPresence: 0.5, minPeerAvg: 1 });
    const names = staples.map((s) => s.name);
    expect(names).toContain("Go for the Throat");
    expect(names).not.toContain("Invented Card");
    const gft = staples.find((s) => s.name === "Go for the Throat")!;
    expect(gft.yourCount).toBe(0);
    expect(gft.presence).toBeCloseTo(2 / 3, 5);
  });
});

describe("buildFindings", () => {
  it("flags light lands and missing staples", () => {
    const yours = shapeOf([
      card("Forest", 18, { land: true }),
      card("Bear", 30, { type: "creature", cmc: 2 }),
      card("Bolt", 4, { type: "instant", cmc: 1 }),
    ]);
    const peer = averageShapes([
      shapeOf([
        card("Forest", 24, { land: true }),
        card("Bear", 20, { type: "creature", cmc: 2 }),
        card("Bolt", 10, { type: "instant", cmc: 1 }),
      ]),
    ]);
    const findings = buildFindings(yours, peer, [
      {
        name: "Go for the Throat",
        peerAvg: 3,
        presence: 0.8,
        yourCount: 0,
        delta: -3,
      },
    ]);
    expect(findings.some((f) => f.id === "main-lands")).toBe(true);
    expect(findings.some((f) => f.id.includes("staple"))).toBe(true);
  });
});

describe("runBrewClinic", () => {
  it("compares a thin list to ranked peers", () => {
    const meta = metaWithPeers([
      midrange("Golgari Midrange", "a"),
      midrange("Golgari Midrange 2", "b"),
      midrange("Golgari Midrange 3", "c"),
    ]);
    // Short on lands + interaction, no Go for the Throat
    const main = fromCardEntries([
      { name: "Forest", count: 12, land: true, cmc: 0 },
      { name: "Swamp", count: 8, land: true, cmc: 0 },
      { name: "Llanowar Elves", count: 4, type: "creature", cmc: 1 },
      { name: "Random Creature", count: 20, type: "creature", cmc: 3 },
      { name: "Random Creature 2", count: 16, type: "creature", cmc: 4 },
    ]);
    const report = runBrewClinic({
      deckName: "Golgari Midrange",
      main,
      meta,
      mode: "bo1",
      formatId: "standard",
    });
    expect(report.emptyReason).toBeUndefined();
    expect(report.peerCount).toBe(3);
    expect(report.matchedPeerName).toBeTruthy();
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.yourMain.total).toBe(60);
  });

  it("returns emptyReason without a list", () => {
    const report = runBrewClinic({
      deckName: "Test",
      main: [],
      meta: metaWithPeers([midrange("X", "x")]),
      mode: "bo1",
    });
    expect(report.emptyReason).toMatch(/mainboard/i);
  });
});

describe("clinicGrade (v2.0)", () => {
  const meta = metaWithPeers([
    midrange("Golgari Midrange", "a"),
    midrange("Golgari Midrange 2", "b"),
    midrange("Golgari Midrange 3", "c"),
  ]);

  it("grades a peer-shaped list higher than a warped one", () => {
    const peerLike = runBrewClinic({
      deckName: "Golgari Midrange",
      main: midrange("Golgari Midrange", "a").mainboard.map((c) => ({ ...c })),
      meta,
      mode: "bo1",
      formatId: "standard",
    });
    const warped = runBrewClinic({
      deckName: "Golgari Midrange",
      main: fromCardEntries([
        { name: "Forest", count: 10, land: true, cmc: 0 },
        { name: "Big Idiot", count: 50, type: "creature", cmc: 7 },
      ]),
      meta,
      mode: "bo1",
      formatId: "standard",
    });
    const gGood = clinicGrade(peerLike);
    const gBad = clinicGrade(warped);
    expect(gGood).not.toBeNull();
    expect(gBad).not.toBeNull();
    expect(gGood!.score).toBeGreaterThan(gBad!.score);
    expect(gGood!.score).toBeGreaterThanOrEqual(88); // literally a peer list
    expect(gBad!.letter).toMatch(/C|D/);
    expect(gGood!.axes.map((a) => a.id)).toEqual([
      "mana",
      "curve",
      "interaction",
      "staples",
    ]);
    for (const a of [...gGood!.axes, ...gBad!.axes]) {
      expect(a.score).toBeGreaterThanOrEqual(0);
      expect(a.score).toBeLessThanOrEqual(100);
    }
  });

  it("returns null on empty reports and renders copyable text otherwise", () => {
    const empty = runBrewClinic({ deckName: "X", main: [], meta, mode: "bo1" });
    expect(clinicGrade(empty)).toBeNull();
    const report = runBrewClinic({
      deckName: "Golgari Midrange",
      main: midrange("Golgari Midrange", "a").mainboard.map((c) => ({ ...c })),
      meta,
      mode: "bo1",
      formatId: "standard",
    });
    const grade = clinicGrade(report);
    const text = clinicReportText("Golgari Midrange", report, grade);
    expect(text).toContain("Brew Lab clinic — Golgari Midrange");
    expect(text).toContain("Grade:");
    expect(text).toContain("no invented cards");
  });
});

describe("fromNamedLines (paste mode)", () => {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

  it("maps resolved names, merges duplicates, reports unknowns", () => {
    const { cards, unknown } = fromNamedLines(
      [
        { name: "Shock", count: 2 },
        { name: "shock", count: 2 },
        { name: "Totally Fake Card", count: 4 },
        { name: "Forest", count: 20 },
      ],
      {
        shock: { name: "Shock", typeLine: "Instant", cmc: 1 },
        forest: { name: "Forest", typeLine: "Basic Land — Forest", cmc: 0 },
        "totally fake card": null,
      },
      norm,
    );
    expect(unknown).toEqual(["Totally Fake Card"]);
    const shock = cards.find((c) => c.name === "Shock");
    expect(shock?.count).toBe(4);
    expect(shock?.type).toBe("instant");
    expect(cards.find((c) => c.name === "Forest")?.land).toBe(true);
  });
});
