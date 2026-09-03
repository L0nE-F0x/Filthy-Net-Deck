import { describe, expect, it } from "vitest";
import type { ArenaCardMeta } from "../services/arenaMeta";
import type { LiveCardCount } from "../types/tracker";
import {
  cardGroupId,
  drawPct,
  formatClock,
  formatConfidencePct,
  groupLibrary,
  groupSeenCards,
  landDrawHeadline,
  matchupHudLine,
  normalizeDensity,
  normalizeOpacity,
  normalizeWindowMode,
  opponentCardsSeenCount,
  overlayHudReady,
  parseManaCost,
  pipText,
  pipTone,
  playDrawLabel,
  sessionWl,
  showSideboardTab,
} from "./overlayModel";

function meta(partial: Partial<ArenaCardMeta>): ArenaCardMeta {
  return {
    name: "X",
    typeLine: "Sorcery",
    isLand: false,
    scryfallId: "abc",
    artUrl: null,
    cmc: null,
    manaCost: null,
    ...partial,
  };
}

describe("cardGroupId", () => {
  it("buckets by type line", () => {
    expect(cardGroupId(meta({ isLand: true, typeLine: "Basic Land — Island" }))).toBe("land");
    expect(cardGroupId(meta({ typeLine: "Legendary Creature — Human Wizard" }))).toBe("creature");
    expect(cardGroupId(meta({ typeLine: "Artifact Creature — Golem" }))).toBe("creature");
    expect(cardGroupId(meta({ typeLine: "Instant" }))).toBe("spell");
    expect(cardGroupId(meta({ typeLine: "Planeswalker — Jace" }))).toBe("spell");
  });

  it("treats unknown meta as spell", () => {
    expect(cardGroupId(undefined)).toBe("spell");
    expect(cardGroupId(null)).toBe("spell");
  });
});

describe("groupLibrary", () => {
  const island = meta({ name: "Island", isLand: true, typeLine: "Basic Land — Island" });
  const swamp = meta({ name: "Swamp", isLand: true, typeLine: "Basic Land — Swamp" });
  const bear = meta({ name: "Bear", typeLine: "Creature — Bear", cmc: 2 });
  const elf = meta({ name: "Elf", typeLine: "Creature — Elf Druid", cmc: 1 });
  const bolt = meta({ name: "Bolt", typeLine: "Instant", cmc: 1 });

  const library: LiveCardCount[] = [
    { grpId: 5, remaining: 3, total: 4 }, // bolt
    { grpId: 1, remaining: 10, total: 14 }, // island
    { grpId: 4, remaining: 2, total: 4 }, // elf
    { grpId: 3, remaining: 4, total: 4 }, // bear
    { grpId: 2, remaining: 8, total: 10 }, // swamp
    { grpId: 6, remaining: 0, total: 2 }, // exhausted — dropped
  ];
  const byId = new Map([
    [1, island],
    [2, swamp],
    [3, bear],
    [4, elf],
    [5, bolt],
  ]);

  it("groups lands first, then creatures, then spells; skips exhausted rows", () => {
    const groups = groupLibrary(library, (id) => byId.get(id));
    expect(groups.map((g) => g.id)).toEqual(["land", "creature", "spell"]);
    expect(groups[0].rows.map((r) => r.card.grpId)).toEqual([1, 2]); // alpha: Island, Swamp
    expect(groups[1].rows.map((r) => r.card.grpId)).toEqual([4, 3]); // cmc 1 before 2
    expect(groups[2].rows.map((r) => r.card.grpId)).toEqual([5]);
    expect(groups[0].remaining).toBe(18);
  });

  it("sorts unknown cmc after known cmc", () => {
    const mystery = meta({ name: "Mystery", typeLine: "Tribal Instant", cmc: null });
    const lib: LiveCardCount[] = [
      { grpId: 7, remaining: 1, total: 1 }, // mystery, cmc null
      { grpId: 5, remaining: 1, total: 1 }, // bolt, cmc 1
    ];
    const groups = groupLibrary(lib, (id) => (id === 7 ? mystery : bolt));
    expect(groups).toHaveLength(1);
    expect(groups[0].rows.map((r) => r.card.grpId)).toEqual([5, 7]);
  });

  it("returns no groups for an empty library", () => {
    expect(groupLibrary([], () => undefined)).toEqual([]);
  });
});

describe("drawPct", () => {
  it("computes one-decimal next-draw chance", () => {
    expect(drawPct(4, 45)).toBe(8.9);
    expect(drawPct(1, 60)).toBe(1.7);
  });

  it("is null when nothing to draw from or no copies left", () => {
    expect(drawPct(0, 45)).toBeNull();
    expect(drawPct(4, 0)).toBeNull();
  });
});

describe("parseManaCost", () => {
  it("splits Scryfall cost strings into symbols", () => {
    expect(parseManaCost("{2}{U}{U}")).toEqual(["2", "U", "U"]);
    expect(parseManaCost("{X}{R}")).toEqual(["X", "R"]);
    expect(parseManaCost("{W/U}{G}")).toEqual(["W/U", "G"]);
    expect(parseManaCost("")).toEqual([]);
    expect(parseManaCost(null)).toEqual([]);
  });
});

describe("pipTone / pipText", () => {
  it("maps symbols to colors", () => {
    expect(pipTone("W")).toBe("w");
    expect(pipTone("U")).toBe("u");
    expect(pipTone("B")).toBe("b");
    expect(pipTone("R")).toBe("r");
    expect(pipTone("G")).toBe("g");
    expect(pipTone("C")).toBe("c");
    expect(pipTone("3")).toBe("x");
    expect(pipTone("X")).toBe("x");
  });

  it("hybrid and phyrexian take the front face color", () => {
    expect(pipTone("W/U")).toBe("w");
    expect(pipTone("B/P")).toBe("b");
    expect(pipText("W/U")).toBe("WU");
    expect(pipText("B/P")).toBe("B");
    expect(pipText("2")).toBe("2");
  });
});

describe("formatClock", () => {
  it("formats m:ss from match start", () => {
    const t0 = 1_000_000;
    expect(formatClock(t0, t0)).toBe("0:00");
    expect(formatClock(t0, t0 + 59_000)).toBe("0:59");
    expect(formatClock(t0, t0 + 60_000)).toBe("1:00");
    expect(formatClock(t0, t0 + 601_500)).toBe("10:01");
  });

  it("never goes negative", () => {
    expect(formatClock(2_000, 1_000)).toBe("0:00");
  });
});

describe("normalizeOpacity", () => {
  it("clamps into the readable band", () => {
    expect(normalizeOpacity(0.8)).toBe(0.8);
    expect(normalizeOpacity(0.1)).toBe(0.55);
    expect(normalizeOpacity(5)).toBe(1);
  });

  it("falls back to the default for junk", () => {
    expect(normalizeOpacity(undefined)).toBe(0.92);
    expect(normalizeOpacity("nope")).toBe(0.92);
  });
});

describe("matchupHudLine", () => {
  const rows = [
    { archetype: "Izzet Prowess", wins: 5, losses: 3, rate: 5 / 8 },
    { archetype: "Domain", wins: 1, losses: 0, rate: 1 },
  ];

  it("returns null when archetype missing or thin sample", () => {
    expect(matchupHudLine(rows, null)).toBeNull();
    expect(matchupHudLine(rows, "Domain")).toBeNull(); // sample 1 < 2
    expect(matchupHudLine(rows, "Unknown")).toBeNull();
  });

  it("formats short and detail for enough sample", () => {
    const line = matchupHudLine(rows, "Izzet Prowess");
    expect(line).not.toBeNull();
    expect(line!.wrPct).toBe(63);
    expect(line!.short).toBe("63% (5–3)");
    expect(line!.detail).toBe("5–3 (63%) on this deck");
    expect(line!.sample).toBe(8);
  });

  it("honors a higher minSample", () => {
    expect(matchupHudLine(rows, "Izzet Prowess", 10)).toBeNull();
  });
});

describe("opponentCardsSeenCount", () => {
  it("counts distinct finite ids", () => {
    expect(opponentCardsSeenCount(undefined)).toBe(0);
    expect(opponentCardsSeenCount([1, 1, 2, Number.NaN])).toBe(2);
  });
});

describe("groupSeenCards", () => {
  const metas = new Map<number, ArenaCardMeta>([
    [10, meta({ name: "Mountain", typeLine: "Basic Land — Mountain", isLand: true })],
    [20, meta({ name: "Slickshot Show-Off", typeLine: "Creature — Bird Wizard", cmc: 2 })],
    [30, meta({ name: "Sleight of Hand", typeLine: "Sorcery", cmc: 1 })],
  ]);
  const metaOf = (id: number) => metas.get(id);

  it("groups seen ids like the library list and keeps quantities", () => {
    const groups = groupSeenCards([20, 10, 30, 20, 10], metaOf);
    expect(groups.map((g) => g.id)).toEqual(["land", "creature", "spell"]);
    const rows = groups.flatMap((g) => g.rows);
    expect(rows.length).toBe(3);
    expect(rows.find((r) => r.card.grpId === 20)?.card.remaining).toBe(2);
    expect(rows.find((r) => r.card.grpId === 10)?.card.remaining).toBe(2);
    expect(rows.find((r) => r.card.grpId === 30)?.card.remaining).toBe(1);
    expect(groups.find((g) => g.id === "land")?.remaining).toBe(2);
  });

  it("returns empty for nothing seen", () => {
    expect(groupSeenCards(undefined, metaOf)).toEqual([]);
    expect(groupSeenCards([], metaOf)).toEqual([]);
  });
});

describe("normalizeDensity", () => {
  it("passes valid values and defaults junk to compact", () => {
    expect(normalizeDensity("cozy")).toBe("cozy");
    expect(normalizeDensity("minimal")).toBe("minimal");
    expect(normalizeDensity("compact")).toBe("compact");
    expect(normalizeDensity(undefined)).toBe("compact");
    expect(normalizeDensity("huge")).toBe("compact");
  });
});

describe("normalizeWindowMode", () => {
  it("only companion is opt-in; everything else is overlay", () => {
    expect(normalizeWindowMode("companion")).toBe("companion");
    expect(normalizeWindowMode("overlay")).toBe("overlay");
    expect(normalizeWindowMode(undefined)).toBe("overlay");
    expect(normalizeWindowMode("hud")).toBe("overlay");
  });
});

describe("formatConfidencePct", () => {
  it("rounds a 0–1 confidence to a percent chip", () => {
    expect(formatConfidencePct(0.72)).toBe("72%");
    expect(formatConfidencePct(0.355)).toBe("36%");
    expect(formatConfidencePct(1)).toBe("100%");
  });
});

describe("sessionWl", () => {
  const matches = [
    { result: "win", endedAt: 100 },
    { result: "loss", endedAt: 200 },
    { result: "win", endedAt: 300 },
    { result: "draw", endedAt: 400 },
    { result: "loss", endedAt: 50 },
  ];

  it("counts decided games inside the window", () => {
    const rec = sessionWl(matches, 100);
    expect(rec).toEqual({ wins: 2, losses: 1, wr: 67 });
  });

  it("returns null wr when nothing decided", () => {
    expect(sessionWl([], 0)).toEqual({ wins: 0, losses: 0, wr: null });
  });
});

describe("landDrawHeadline", () => {
  it("is remaining lands over remaining library", () => {
    const h = landDrawHeadline(12, 34);
    expect(h).not.toBeNull();
    expect(h!.pct).toBeCloseTo(35.3, 1);
    expect(h!.label).toBe("Land 35.3%");
    expect(h!.title).toContain("12 lands left");
  });

  it("hides when the library is empty", () => {
    expect(landDrawHeadline(0, 10)).toBeNull();
    expect(landDrawHeadline(4, 0)).toBeNull();
  });
});

describe("playDrawLabel", () => {
  it("maps the on-play flag to a chip label", () => {
    expect(playDrawLabel(true)).toBe("Play");
    expect(playDrawLabel(false)).toBe("Draw");
    expect(playDrawLabel(null)).toBeNull();
    expect(playDrawLabel(undefined)).toBeNull();
  });
});

describe("showSideboardTab", () => {
  it("shows for Bo3 even before sideboard cards arrive", () => {
    expect(showSideboardTab({ bestOf: 3 })).toBe(true);
    expect(showSideboardTab({ bestOf: 1 })).toBe(false);
  });

  it("shows when GRE reported sideboard cards (even on Bo1 edge cases)", () => {
    expect(
      showSideboardTab({
        bestOf: 1,
        sideboard: [{ grpId: 1, remaining: 2, total: 2 }],
        sideboardTotal: 2,
      }),
    ).toBe(true);
  });
});

describe("overlayHudReady", () => {
  it("is false until a live match has something to paint", () => {
    expect(overlayHudReady(null)).toBe(false);
    expect(
      overlayHudReady({
        matchId: "m",
        phase: "playing",
        startedAt: 1,
        eventId: "Ladder",
        bestOf: 1,
      }),
    ).toBe(false);
    expect(
      overlayHudReady({
        matchId: "m",
        phase: "playing",
        startedAt: 1,
        eventId: "Ladder",
        bestOf: 1,
        opponentName: "Rival",
      }),
    ).toBe(true);
  });
});
