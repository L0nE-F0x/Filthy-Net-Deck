import { describe, expect, it, vi } from "vitest";
import {
  EVERGREEN_ARENA_SETS,
  artistKey,
  buildArenaNameGap,
  colorsFromIds,
  joinScryfall,
  manaCostFromArena,
  nameKey,
  recentSetCodes,
  scryfallArenaIdsForSet,
  setCodesToSearch,
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
    expect(codes.has("fin")).toBe(true);
    expect(codes.has("hob")).toBe(true);
  });

  it("excludes sets older than the window", () => {
    const codes = recentSetCodes(
      [{ code: "old", released_at: new Date(NOW - 400 * day).toISOString().slice(0, 10) }],
      NOW,
    );
    expect(codes.has("old")).toBe(false);
  });

  it("includes announced sets with no date at all", () => {
    // A set Scryfall has created but not dated is the earliest part of exactly
    // the window this exists for — dropping it would miss the first spoilers.
    const codes = recentSetCodes([{ code: "future" }, { code: "bad", released_at: "nonsense" }], NOW);
    expect(codes.has("future")).toBe(true);
    expect(codes.has("bad")).toBe(true);
  });

  it("always includes evergreen Arena promo dumps even when they date to 2018", () => {
    // ANA's Scryfall released_at is 2018-07-14. The Green Game Jam basics
    // landed there in June 2026; dropping ANA as "too old" left them as
    // Card #107494 with a blank art tile. UNF (2022) is the same shape:
    // players sleeve those lands onto live constructed decks.
    const codes = recentSetCodes(
      [{ code: "ANA", released_at: "2018-07-14" }, { code: "pana", released_at: "2018-07-14" }],
      NOW,
    );
    for (const c of EVERGREEN_ARENA_SETS) expect(codes.has(c)).toBe(true);
    expect(codes.has("unf")).toBe(true);
    // And they stay in even if the set list we were handed omitted the row.
    const empty = recentSetCodes([], NOW);
    for (const c of EVERGREEN_ARENA_SETS) expect(empty.has(c)).toBe(true);
  });

  it("ignores junk rows rather than throwing", () => {
    const codes = recentSetCodes([null, {}, { code: "" }, undefined], NOW);
    expect(codes.has("")).toBe(false);
    expect(recentSetCodes(null, NOW).has("ana")).toBe(true);
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

describe("artistKey / set aliases / joinScryfall", () => {
  it("normalises artist names the same way on both sides of the join", () => {
    expect(artistKey("  Daren Bader ")).toBe("daren bader");
    expect(artistKey(null)).toBe("");
  });

  it("searches pana when the Arena set is ANA", () => {
    // Arena dumps store cosmetics as ANA; Scryfall files the prints as pana.
    expect(setCodesToSearch("ANA")).toEqual(["ana", "pana"]);
    expect(setCodesToSearch("hob")).toEqual(["hob"]);
    expect(setCodesToSearch("")).toEqual([]);
  });

  it("joins a basic land on name+artist, not on the first Plains in the set", () => {
    // The Green Game Jam report: five ANA basics, five pana paintings, one
    // name each. First-wins on "plains" would show the 2018 NPE/pana Plains
    // on a 2026 Daren Bader Game Jam Plains.
    const found = {
      byName: new Map([
        ["plains", { id: "old-plains", typeLine: "Basic Land — Plains" }],
        ["swamp", { id: "old-swamp", typeLine: "Basic Land — Swamp" }],
      ]),
      byArtist: new Map([
        ["plains\0daren bader", { id: "ggj-plains", typeLine: "Basic Land — Plains" }],
        ["swamp\0daren bader", { id: "ggj-swamp", typeLine: "Basic Land — Swamp" }],
      ]),
    };
    expect(joinScryfall(found, "Plains", "Daren Bader").id).toBe("ggj-plains");
    expect(joinScryfall(found, "Swamp", "Daren Bader").id).toBe("ggj-swamp");
    // Same artist, different land — must not cross-wire a Swamp onto Plains.
    expect(joinScryfall(found, "Plains", "Daren Bader").id).not.toBe("ggj-swamp");
  });

  it("refuses a name-only join when the caller says artist is required", () => {
    // Evergreen ANA: a miss must stay a miss, not become the first Plains.
    const found = {
      byName: new Map([["plains", { id: "old-plains", typeLine: "Basic Land — Plains" }]]),
      byArtist: new Map(),
    };
    expect(joinScryfall(found, "Plains", "Daren Bader", { artistRequired: true })).toBeNull();
    expect(joinScryfall(found, "Plains", "Daren Bader").id).toBe("old-plains");
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
    expect(byName.get("the sackville-bagginses")).toMatchObject({
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
    expect(byName.get("burglar's plot")).toMatchObject({
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

  it("indexes paper prints when game:arena 404s, so Unfinity lands still get art", async () => {
    // `set:unf game:arena` 404s; the lands are tagged paper/mtgo only.
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation((u) => {
      const url = String(u);
      const q = decodeURIComponent((url.match(/q=([^&]+)/) || [])[1] || "");
      if (q.includes("game:arena")) {
        return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              {
                id: "unf-swamp",
                name: "Swamp",
                type_line: "Basic Land — Swamp",
                artist: "Adam Paquette",
                arena_id: null,
              },
            ],
            has_more: false,
          }),
      });
    });
    const { ids, byName, byArtist } = await scryfallArenaIdsForSet("unf", 1);
    expect(ids.size).toBe(0);
    expect(byName.get("swamp").id).toBe("unf-swamp");
    expect(byArtist.get("swamp\0adam paquette").id).toBe("unf-swamp");
    spy.mockRestore();
  });

  it("indexes by artist so two Plains paintings stay distinct", async () => {
    const spy = mockSearch([
      {
        id: "old-plains",
        name: "Plains",
        type_line: "Basic Land — Plains",
        artist: "Donato Giancola",
        released_at: "2018-07-14",
        arena_id: null,
      },
      {
        id: "ggj-plains",
        name: "Plains",
        type_line: "Basic Land — Plains",
        artist: "Daren Bader",
        released_at: "2026-06-06",
        arena_id: null,
      },
    ]);
    const { byName, byArtist } = await scryfallArenaIdsForSet("pana", 1);
    expect(byArtist.get("plains\0daren bader").id).toBe("ggj-plains");
    expect(byArtist.get("plains\0donato giancola").id).toBe("old-plains");
    // Name-only prefers the unlinked newer print (Game Jam), not first-wins.
    expect(byName.get("plains").id).toBe("ggj-plains");
    spy.mockRestore();
  });

  it("prefers an unlinked print over one Scryfall already tied to an arena_id", async () => {
    const spy = mockSearch([
      {
        id: "linked",
        name: "Plains",
        type_line: "Basic Land — Plains",
        artist: "Someone",
        arena_id: 7193,
        released_at: "2026-07-01",
      },
      {
        id: "gap",
        name: "Plains",
        type_line: "Basic Land — Plains",
        artist: "Someone",
        arena_id: null,
        released_at: "2026-06-06",
      },
    ]);
    const { ids, byName } = await scryfallArenaIdsForSet("pana", 1);
    expect(ids.has(7193)).toBe(true);
    expect(byName.get("plains").id).toBe("gap");
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

  it("publishes Green Game Jam basics from ANA with their pana art", async () => {
    // The 2026-08-25 bug report: Card #107494 (and the four siblings) showed
    // no art. Arena stores them as ANA / DigitalReleaseSet ANA-GGJ-2026;
    // Scryfall has the paintings in pana with arena_id null. ANA's Scryfall
    // released_at is 2018, so the 180-day window used to skip the whole set.
    const sets = [{ code: "ana", released_at: "2018-07-14" }];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((u) => {
      const url = String(u);
      if (url.includes("/cards.json")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                grpid: 107492,
                titleId: 1,
                set: "ANA",
                artistCredit: "Daren Bader",
                types: [5],
                colorIdentity: [1],
                collectorNumber: "1",
              },
              {
                grpid: 107494,
                titleId: 3,
                set: "ANA",
                artistCredit: "Daren Bader",
                types: [5],
                colorIdentity: [3],
                collectorNumber: "3",
              },
            ]),
        });
      }
      if (url.includes("/loc_en.json")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              { id: 1, text: "Plains" },
              { id: 3, text: "Swamp" },
            ]),
        });
      }
      const q = decodeURIComponent((url.match(/q=([^&]+)/) || [])[1] || "");
      const set = (q.match(/set:(\w+)/) || [])[1];
      const bySet = {
        ana: [
          {
            id: "npe-plains",
            name: "Plains",
            type_line: "Basic Land — Plains",
            artist: "Eytan Zana",
            arena_id: 7193,
            released_at: "2018-07-14",
          },
        ],
        pana: [
          {
            id: "old-plains",
            name: "Plains",
            type_line: "Basic Land — Plains",
            artist: "Donato Giancola",
            arena_id: null,
            released_at: "2018-07-14",
          },
          {
            id: "ggj-plains",
            name: "Plains",
            type_line: "Basic Land — Plains",
            artist: "Daren Bader",
            arena_id: null,
            released_at: "2026-06-06",
          },
          {
            id: "ggj-swamp",
            name: "Swamp",
            type_line: "Basic Land — Swamp",
            artist: "Daren Bader",
            arena_id: null,
            released_at: "2026-06-06",
          },
        ],
      };
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: bySet[set] || [], has_more: false }),
      });
    });

    const out = await buildArenaNameGap({ previous: {}, sets, tries: 1 });
    expect(out["107492"]).toMatchObject({
      n: "Plains",
      i: "W",
      l: 1,
      s: "ggj-plains",
      t: "Basic Land — Plains",
    });
    expect(out["107494"]).toMatchObject({
      n: "Swamp",
      i: "B",
      l: 1,
      s: "ggj-swamp",
      t: "Basic Land — Swamp",
    });
    // Must not collapse both lands onto one painting just because the artist
    // is the same, and must not pick the 2018 pana Plains either.
    expect(out["107492"].s).not.toBe(out["107494"].s);
    expect(out["107492"].s).not.toBe("old-plains");
    expect(out["107492"].s).not.toBe("npe-plains");
    fetchSpy.mockRestore();
  });

  it("names Unfinity cosmetic basics that Scryfall has no arena_id for", async () => {
    // Live 2026-09-01: overlay showed `Card 81181` for an Unfinity Swamp.
    // `/cards/arena/81181` 404s and `set:unf game:arena` 404s; the paper
    // set still has Adam Paquette's painting.
    const sets = [{ code: "unf", released_at: "2022-10-07" }];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((u) => {
      const url = String(u);
      if (url.includes("/cards.json")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                grpid: 81181,
                titleId: 3,
                set: "UNF",
                artistCredit: "Adam Paquette",
                types: [5],
                colorIdentity: [3],
              },
            ]),
        });
      }
      if (url.includes("/loc_en.json")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{ id: 3, text: "Swamp" }]),
        });
      }
      const q = decodeURIComponent((url.match(/q=([^&]+)/) || [])[1] || "");
      if (q.includes("game:arena")) {
        return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              {
                id: "unf-swamp-art",
                name: "Swamp",
                type_line: "Basic Land — Swamp",
                artist: "Adam Paquette",
                arena_id: null,
                released_at: "2022-10-07",
              },
            ],
            has_more: false,
          }),
      });
    });

    const out = await buildArenaNameGap({ previous: {}, sets, tries: 1 });
    expect(out["81181"]).toMatchObject({
      n: "Swamp",
      i: "B",
      l: 1,
      s: "unf-swamp-art",
      t: "Basic Land — Swamp",
    });
    fetchSpy.mockRestore();
  });

  it("still names a basic from an old set the 180-day window skipped", async () => {
    // Jumpstart 2020 (or any other old cosmetic pile). Not evergreen, not
    // recent. Name + land flag only — no name-only art join.
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((u) => {
      const url = String(u);
      if (url.includes("/cards.json")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                grpid: 99991,
                titleId: 3,
                set: "JMP",
                types: [5],
                colorIdentity: [3],
              },
            ]),
        });
      }
      if (url.includes("/loc_en.json")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{ id: 3, text: "Swamp" }]),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: [], has_more: false }),
      });
    });

    const out = await buildArenaNameGap({ previous: {}, sets: [], tries: 1 });
    expect(out["99991"]).toMatchObject({ n: "Swamp", i: "B", l: 1 });
    expect(out["99991"].s).toBeUndefined();
    fetchSpy.mockRestore();
  });
});
