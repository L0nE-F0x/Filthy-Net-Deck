import { describe, expect, it, vi } from "vitest";
import {
  buildArenaNameGap,
  colorsFromIds,
  manaCostFromArena,
  nameKey,
  recentSetCodes,
  scryfallArenaIdsForSet,
} from "./sources/arena-names.mjs";

describe("colorsFromIds", () => {
  it("maps Arena's colour enum, verified against the five basics", () => {
    // Plains [1], Island [2], Swamp [3], Mountain [4], Forest [5] in mtgajson.
    expect(colorsFromIds([1])).toBe("W");
    expect(colorsFromIds([2])).toBe("U");
    expect(colorsFromIds([3])).toBe("B");
    expect(colorsFromIds([4])).toBe("R");
    expect(colorsFromIds([5])).toBe("G");
  });

  it("normalises to WUBRG order regardless of input order", () => {
    expect(colorsFromIds([4, 3])).toBe("BR");
    expect(colorsFromIds([5, 1])).toBe("WG");
    expect(colorsFromIds([3, 1, 5])).toBe("WBG");
  });

  it("returns empty for unknown or absent input rather than guessing", () => {
    // Empty must stay distinguishable from a real colourless card downstream,
    // so this never invents a value.
    expect(colorsFromIds(null)).toBe("");
    expect(colorsFromIds([])).toBe("");
    expect(colorsFromIds([99, 0, -1])).toBe("");
    expect(colorsFromIds("BR")).toBe("");
  });

  it("de-duplicates", () => {
    expect(colorsFromIds([3, 3, 4])).toBe("BR");
  });
});

const NOW = Date.parse("2026-08-12T00:00:00Z");
const day = 24 * 60 * 60 * 1000;

describe("recentSetCodes", () => {
  it("includes sets released inside the window", () => {
    const codes = recentSetCodes(
      [
        { code: "HOB", released_at: "2026-08-14" }, // 2 days out
        { code: "fin", released_at: "2026-06-01" }, // ~10 weeks ago
      ],
      NOW,
    );
    // Codes are lowercased so they join with mtgajson's, which are uppercase.
    expect([...codes].sort()).toEqual(["fin", "hob"]);
  });

  it("excludes sets older than the window", () => {
    const codes = recentSetCodes(
      [{ code: "old", released_at: new Date(NOW - 400 * day).toISOString().slice(0, 10) }],
      NOW,
    );
    expect(codes.size).toBe(0);
  });

  it("includes announced sets with no date at all", () => {
    // A set Scryfall has created but not dated is the earliest part of exactly
    // the window this exists for — dropping it would miss the first spoilers.
    const codes = recentSetCodes([{ code: "future" }, { code: "bad", released_at: "nonsense" }], NOW);
    expect([...codes].sort()).toEqual(["bad", "future"]);
  });

  it("ignores junk rows rather than throwing", () => {
    expect(recentSetCodes([null, {}, { code: "" }, undefined], NOW).size).toBe(0);
    expect(recentSetCodes(null, NOW).size).toBe(0);
  });
});

describe("manaCostFromArena", () => {
  it("converts Arena's o-prefixed notation to Scryfall's", () => {
    // Pips in the deck list and the overlay come from manaCost, not colour
    // identity, so without this a card has the right curve slot and no pips.
    expect(manaCostFromArena("oBoR")).toBe("{B}{R}");
    expect(manaCostFromArena("o1o(B/R)o(B/R)")).toBe("{1}{B/R}{B/R}");
    expect(manaCostFromArena("o2oWoW")).toBe("{2}{W}{W}");
  });

  it("handles the awkward atoms", () => {
    expect(manaCostFromArena("oX")).toBe("{X}");
    expect(manaCostFromArena("o10")).toBe("{10}"); // two digits, not {1}{0}
    expect(manaCostFromArena("oC")).toBe("{C}");
    expect(manaCostFromArena("o(B/P)")).toBe("{B/P}"); // Phyrexian
    expect(manaCostFromArena("o0")).toBe("{0}");
  });

  it("returns null rather than an empty cost when there is nothing to read", () => {
    // A land has no casting cost; null keeps that distinct from "{0}".
    expect(manaCostFromArena(null)).toBeNull();
    expect(manaCostFromArena("")).toBeNull();
    expect(manaCostFromArena(undefined)).toBeNull();
    expect(manaCostFromArena(42)).toBeNull();
  });
});

describe("nameKey — joining Arena's names to Scryfall's", () => {
  it("keys a double-faced card on its front face", () => {
    // Arena's loc table names only the front face; Scryfall names both. Without
    // this the join misses every DFC in a new set and they lose their art.
    expect(nameKey("Bilbo, Retired Burglar // Bilbo, Birthday Celebrant")).toBe(
      "bilbo, retired burglar",
    );
    expect(nameKey("Bilbo, Retired Burglar")).toBe("bilbo, retired burglar");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(nameKey("  SMAUG the Magnificent ")).toBe("smaug the magnificent");
  });

  it("returns empty for junk rather than throwing", () => {
    expect(nameKey(null)).toBe("");
    expect(nameKey(undefined)).toBe("");
    expect(nameKey("")).toBe("");
  });
});

describe("scryfallArenaIdsForSet — the id index that gives a gap card its art", () => {
  function mockSearch(cards) {
    return vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: cards, has_more: false }),
      }),
    );
  }

  it("indexes Scryfall's id and type line for cards with no arena_id", async () => {
    // The whole point: the response that PROVES the arena_id is missing also
    // carries the id and type line. v3.0.1–v3.0.3 discarded both.
    const spy = mockSearch([
      {
        id: "ed87b471-79f9-45ec-9188-69e970f6121e",
        name: "The Sackville-Bagginses",
        type_line: "Legendary Creature — Halfling Citizen",
        arena_id: null,
      },
    ]);
    const { ids, byName } = await scryfallArenaIdsForSet("hob", 1);
    expect(ids.size).toBe(0);
    expect(byName.get("the sackville-bagginses")).toEqual({
      id: "ed87b471-79f9-45ec-9188-69e970f6121e",
      typeLine: "Legendary Creature — Halfling Citizen",
    });
    spy.mockRestore();
  });

  it("still collects arena_ids, so a resolved card is still pruned", async () => {
    const spy = mockSearch([{ id: "abc", name: "Known Card", arena_id: 12345 }]);
    const { ids } = await scryfallArenaIdsForSet("hob", 1);
    expect(ids.has(12345)).toBe(true);
    spy.mockRestore();
  });

  it("indexes both faces of a DFC so either name joins", async () => {
    const spy = mockSearch([
      {
        id: "dfc-1",
        name: "Front Face // Back Face",
        card_faces: [
          { name: "Front Face", type_line: "Creature — Halfling" },
          { name: "Back Face", type_line: "Creature — Halfling" },
        ],
      },
    ]);
    const { byName } = await scryfallArenaIdsForSet("hob", 1);
    expect(byName.get("front face").id).toBe("dfc-1");
    expect(byName.get("back face").id).toBe("dfc-1");
    // The combined name keys on its front face, same as Arena's.
    expect(byName.get("front face").typeLine).toBe("Creature — Halfling");
    spy.mockRestore();
  });

  it("gives an Adventure half its own type line, not the combined one", async () => {
    // Arena gives the Adventure its own grpId. The combined line names both
    // halves, so sharing it would file a Sorcery — Adventure under Creatures.
    const spy = mockSearch([
      {
        id: "adv-1",
        name: "Bilbo, Luckwearer // Burglar's Plot",
        type_line: "Legendary Creature — Halfling Rogue // Sorcery — Adventure",
        card_faces: [
          { name: "Bilbo, Luckwearer", type_line: "Legendary Creature — Halfling Rogue" },
          { name: "Burglar's Plot", type_line: "Sorcery — Adventure" },
        ],
      },
    ]);
    const { byName } = await scryfallArenaIdsForSet("hob", 1);
    expect(byName.get("burglar's plot")).toEqual({
      id: "adv-1",
      typeLine: "Sorcery — Adventure",
    });
    // Both halves still point at the one Scryfall record, so both get art.
    expect(byName.get("bilbo, luckwearer").id).toBe("adv-1");
    expect(byName.get("bilbo, luckwearer").typeLine).toBe(
      "Legendary Creature — Halfling Rogue",
    );
    spy.mockRestore();
  });

  it("pins the first printing so published art does not flip between runs", async () => {
    const spy = mockSearch([
      { id: "base", name: "Smaug the Magnificent", type_line: "Legendary Creature — Dragon" },
      { id: "showcase", name: "Smaug the Magnificent", type_line: "Legendary Creature — Dragon" },
    ]);
    const { byName } = await scryfallArenaIdsForSet("hob", 1);
    expect(byName.get("smaug the magnificent").id).toBe("base");
    spy.mockRestore();
  });

  it("still returns null when the set could not be read at all", async () => {
    // Load-bearing: a network failure must not read as "Scryfall knows nothing
    // here", which would publish the whole set as a gap.
    const spy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    expect(await scryfallArenaIdsForSet("hob", 1)).toBeNull();
    spy.mockRestore();
  });
});

describe("buildArenaNameGap — a partial upstream failure must not delete entries", () => {
  const previous = {
    "103529": { n: "Bolg's Company", c: 2, i: "BR" },
    "103538": { n: "The Great Goblin", c: 3, i: "BR" },
  };

  it("keeps the existing map when the Scryfall set list is unavailable", async () => {
    // The regression: on 2026-08-12 a rate-limited run wrote a shrunken map
    // over the good one and deleted 573 working card names.
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("429"));
    const out = await buildArenaNameGap({ previous, tries: 1 });
    expect(out).toEqual(previous);
    fetchSpy.mockRestore();
  });

  it("keeps the existing map when mtgajson is unreachable", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((u) => {
      const url = String(u);
      if (url.endsWith("/sets")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) });
      }
      return Promise.reject(new Error("down"));
    });
    const out = await buildArenaNameGap({ previous, sets: [], tries: 1 });
    expect(out).toEqual(previous);
    fetchSpy.mockRestore();
  });

  it("never returns fewer entries than it was given when nothing could be read", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const out = await buildArenaNameGap({ previous, sets: [{ code: "hob" }], tries: 1 });
    expect(Object.keys(out).length).toBeGreaterThanOrEqual(Object.keys(previous).length);
    fetchSpy.mockRestore();
  });
});
