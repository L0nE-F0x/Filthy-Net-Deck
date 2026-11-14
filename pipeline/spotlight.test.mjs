import { describe, expect, it } from "vitest";
import { parseMagicGgDecklists } from "./sources/magic-gg.mjs";
import {
  classifyMagicLinks,
  foldName,
  joinStandings,
  parseStandingsTable,
  sameSpotlightPayload,
  selectCalendarEntry,
  selectLiveEntry,
  standingNameKeys,
} from "./sources/spotlight.mjs";

const CAL = [
  {
    id: "wc32",
    name: "World Championship 32",
    format: "standard",
    starts: "2026-11-13",
    ends: "2026-11-15",
    showcaseUntil: "2026-11-22",
    eventUrl: "https://magic.gg/events/magic-world-championship-32",
  },
  {
    id: "old",
    name: "Old",
    format: "pioneer",
    starts: "2026-01-01",
    ends: "2026-01-03",
    showcaseUntil: "2026-01-10",
    eventUrl: "https://magic.gg/events/old",
  },
];

describe("selectCalendarEntry", () => {
  it("keeps the event through the showcase week and then drops it", () => {
    expect(selectCalendarEntry(CAL, "2026-11-12")).toBeNull();
    expect(selectCalendarEntry(CAL, "2026-11-13")?.id).toBe("wc32");
    expect(selectCalendarEntry(CAL, "2026-11-15")?.id).toBe("wc32");
    expect(selectCalendarEntry(CAL, "2026-11-22")?.id).toBe("wc32");
    expect(selectCalendarEntry(CAL, "2026-11-23")).toBeNull();
  });
});

describe("selectLiveEntry", () => {
  it("covers the event days plus one UTC day, not the showcase week", () => {
    expect(selectLiveEntry(CAL, "2026-11-12")).toBeNull();
    expect(selectLiveEntry(CAL, "2026-11-13")?.id).toBe("wc32");
    expect(selectLiveEntry(CAL, "2026-11-15")?.id).toBe("wc32");
    expect(selectLiveEntry(CAL, "2026-11-16")?.id).toBe("wc32");
    expect(selectLiveEntry(CAL, "2026-11-17")).toBeNull();
    expect(selectLiveEntry(CAL, "2026-11-22")).toBeNull();
    expect(selectLiveEntry(CAL, "2026-01-03")?.id).toBe("old");
    expect(selectLiveEntry(CAL, "2026-01-04")?.id).toBe("old");
    expect(selectLiveEntry(CAL, "2026-01-05")).toBeNull();
  });
});

describe("sameSpotlightPayload", () => {
  it("ignores generatedAt and notices a new round", () => {
    const a = { generatedAt: "2026-11-14T01:00:00.000Z", event: { standingsRound: 7 } };
    const b = { generatedAt: "2026-11-14T02:00:00.000Z", event: { standingsRound: 7 } };
    const c = { generatedAt: "2026-11-14T02:00:00.000Z", event: { standingsRound: 8 } };
    expect(sameSpotlightPayload(a, b)).toBe(true);
    expect(sameSpotlightPayload(a, c)).toBe(false);
    expect(sameSpotlightPayload(null, a)).toBe(false);
  });
});

describe("name join", () => {
  it("folds accents and matches Last, First to First Last", () => {
    expect(foldName("Noé Fauquenoi")).toBe("noe fauquenoi");
    expect(standingNameKeys("Fauquenoi, Noé")).toContain("noe fauquenoi");
    expect(standingNameKeys("Puglisi Clark, John")).toContain("john puglisi clark");
    const decks = [
      { id: "yuuki-ichikawa", player: "Yuuki Ichikawa" },
      { id: "john-puglisi-clark", player: "John Puglisi Clark" },
      { id: "noe-fauquenoi", player: "Noé Fauquenoi" },
    ];
    const joined = joinStandings(decks, [
      { rank: 1, player: "Ichikawa, Yuuki", points: 19, omw: 0.69 },
      { rank: 2, player: "Puglisi Clark, John", points: 9, omw: 0.4 },
      { rank: 3, player: "Fauquenoi, Noé", points: 15, omw: 0.6 },
      { rank: 4, player: "Nobody, Here", points: 0, omw: 0 },
    ]);
    expect(joined.map((r) => r.deckId)).toEqual([
      "yuuki-ichikawa",
      "john-puglisi-clark",
      "noe-fauquenoi",
      null,
    ]);
  });

  it("matches the Worlds leftovers without stealing an exact hit", () => {
    const decks = [
      { id: "samuel-pardee", player: "Samuel Pardee" },
      { id: "sek-un-kho", player: "Se̍k-un Khó͘" },
      { id: "joseph-puglisi", player: "Joseph Puglisi" },
      { id: "john-puglisi-clark", player: "John Puglisi Clark" },
      { id: "matthew-stefans", player: "Matthew Stefans" },
    ];
    const joined = joinStandings(decks, [
      { rank: 1, player: "Puglisi Clark, John", points: 9, omw: 0.4 },
      { rank: 2, player: "Pardee, Sam", points: 12, omw: 0.5 },
      { rank: 3, player: "Khóo, Se?k-un", points: 9, omw: 0.4 },
      { rank: 4, player: "Puglisi Clark, Joseph", points: 6, omw: 0.5 },
      { rank: 5, player: "Stefansson, Matthew", points: 3, omw: 0.5 },
    ]);
    expect(joined.map((r) => r.deckId)).toEqual([
      "john-puglisi-clark",
      "samuel-pardee",
      "sek-un-kho",
      "joseph-puglisi",
      "matthew-stefans",
    ]);
  });

  it("does not assign one deck to two standings", () => {
    const decks = [{ id: "a", player: "Seth Manfield" }];
    const joined = joinStandings(decks, [
      { rank: 1, player: "Manfield, Seth", points: 6, omw: 0.5 },
      { rank: 2, player: "Seth Manfield", points: 3, omw: 0.4 },
    ]);
    expect(joined.map((r) => r.deckId)).toEqual(["a", null]);
  });
});

describe("parseStandingsTable", () => {
  it("reads the magic.gg rank table and skips the header", () => {
    const html = `
      <table class='sortable'><tbody>
        <tr><th><b>Rank</b></th><th><b>Player</b></th><th><b>Points</b></th><th><b>OMW%</b></th></tr>
        <tr><td>1</td><td>Ichikawa, Yuuki</td><td>19</td><td>0.6939</td></tr>
        <tr><td>12</td><td>Fauquenoi, Noé</td><td>15</td><td>0.6190</td></tr>
      </tbody></table>`;
    expect(parseStandingsTable(html)).toEqual([
      { rank: 1, player: "Ichikawa, Yuuki", points: 19, omw: 0.6939 },
      { rank: 12, player: "Fauquenoi, Noé", points: 15, omw: 0.619 },
    ]);
  });

  it("keeps one row when the article repeats the table", () => {
    const row = "<tr><td>1</td><td>Ichikawa, Yuuki</td><td>19</td><td>0.6939</td></tr>";
    expect(parseStandingsTable(`<table>${row}${row}</table>`)).toHaveLength(1);
  });
});

describe("classifyMagicLinks", () => {
  it("keeps round standings and full decklist pages, drops spicy articles", () => {
    const html = `
      <a href="/news/magic-world-championship-32-round-6-standings">6</a>
      <a href="/news/magic-world-championship-32-round-7-standings">7</a>
      <a href="/news/magic-world-championship-32-standard-decklists">lists</a>
      <a href="/news/the-spiciest-standard-decklists-from-magic-world-championship-32">spicy</a>
      <a href="/decklists/magic-world-championship-32-standard-decklists-a-l">A-L</a>
      <a href="https://magic.gg/decklists">index</a>`;
    const found = classifyMagicLinks(html);
    expect(found.standings.map((s) => s.round)).toEqual([7, 6]);
    expect(found.standings[0].url).toBe(
      "https://magic.gg/news/magic-world-championship-32-round-7-standings",
    );
    expect(found.articles).toEqual([
      "https://magic.gg/news/magic-world-championship-32-standard-decklists",
    ]);
    expect(found.deckPages).toEqual([
      "https://magic.gg/decklists/magic-world-championship-32-standard-decklists-a-l",
    ]);
  });
});

describe("worlds deck-list shape", () => {
  it("keeps the archetype subtitle on a full constructed list", () => {
    const cards = Array.from({ length: 15 }, (_, i) => `4 Card ${i}`).join("\n");
    const html = `<deck-list deck-title="Seth Manfield" subtitle="Boros Pixie" event-name="World Championship 32" format="Standard"><main-deck>\n${cards}\n</main-deck><side-board>\n2 Seam Rip\n</side-board></deck-list>`;
    const lists = parseMagicGgDecklists(html, { format: "standard" });
    expect(lists).toHaveLength(1);
    expect(lists[0].player).toBe("Seth Manfield");
    expect(lists[0].archetype).toBe("Boros Pixie");
    expect(lists[0].sideboard).toEqual([{ count: 2, name: "Seam Rip" }]);
  });
});
