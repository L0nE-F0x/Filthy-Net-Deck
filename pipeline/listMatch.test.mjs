import { describe, expect, it } from "vitest";
import {
  normalizeCardName,
  pickBestListForTile,
  scoreListForArchetype,
} from "./sources/listMatch.mjs";
import { extractMtgoDecklistsData, parseMtgoEventLists } from "./sources/mtgo.mjs";

describe("normalizeCardName", () => {
  it("uses front face", () => {
    expect(normalizeCardName("Brazen Borrower // Petty Theft")).toBe("brazen borrower");
  });
});

describe("scoreListForArchetype", () => {
  const tile = {
    name: "Selesnya Ouroboroid",
    keyCards: ["Badgermole Cub", "Brightglass Gearhulk", "Ouroboroid"],
  };

  const goodMain = [
    { count: 4, name: "Badgermole Cub" },
    { count: 4, name: "Brightglass Gearhulk" },
    { count: 2, name: "Ouroboroid" },
    { count: 4, name: "Llanowar Elves" },
    { count: 4, name: "Pawpatch Recruit" },
    { count: 3, name: "Surrak, Elusive Hunter" },
    { count: 4, name: "Practiced Offense" },
    { count: 2, name: "Seam Rip" },
    { count: 4, name: "Spider Manifestation" },
    { count: 4, name: "Temple Garden" },
    { count: 4, name: "Hushwood Verge" },
    { count: 6, name: "Forest" },
    { count: 3, name: "Plains" },
    { count: 4, name: "Other Nonland A" },
    { count: 4, name: "Other Nonland B" },
  ];

  const badMain = [
    { count: 4, name: "Monastery Swiftspear" },
    { count: 4, name: "Slickshot Show-Off" },
    { count: 4, name: "Play with Fire" },
    { count: 4, name: "Lightning Strike" },
    { count: 4, name: "Kumano Faces Kakkazan" },
    { count: 4, name: "Sokenzan, Crucible of Defiance" },
    { count: 20, name: "Mountain" },
    { count: 4, name: "Other Red A" },
    { count: 4, name: "Other Red B" },
    { count: 4, name: "Other Red C" },
  ];

  it("accepts a list sharing key cards", () => {
    const s = scoreListForArchetype({ mainboard: goodMain }, tile, null);
    expect(s).not.toBeNull();
    expect(s.keyHits).toBe(3);
  });

  it("rejects an unrelated list", () => {
    expect(scoreListForArchetype({ mainboard: badMain }, tile, null)).toBeNull();
  });

  it("picks the best from a pool", () => {
    const pool = [
      { player: "a", mainboard: badMain, sideboard: [], sourceUrl: "u1", eventName: "e" },
      { player: "b", mainboard: goodMain, sideboard: [], sourceUrl: "u2", eventName: "e" },
    ];
    const hit = pickBestListForTile(pool, tile, null);
    expect(hit?.list.player).toBe("b");
  });
});

describe("extractMtgoDecklistsData", () => {
  it("parses embedded JSON", () => {
    const payload = {
      description: "Test",
      decklists: [
        {
          player: "pilot",
          main_deck: [
            {
              qty: "4",
              card_attributes: { card_name: "Lightning Bolt" },
            },
            {
              qty: "56",
              card_attributes: { card_name: "Mountain" },
            },
          ],
          sideboard_deck: [],
        },
      ],
    };
    const html = `<script>window.MTGO.decklists.data = ${JSON.stringify(payload)};</script>`;
    const data = extractMtgoDecklistsData(html);
    expect(data.description).toBe("Test");
    const lists = parseMtgoEventLists(data, "https://example.com/x");
    // mainCount 60 but only 2 unique - still passes 55-65 count
    expect(lists).toHaveLength(1);
    expect(lists[0].player).toBe("pilot");
    expect(lists[0].mainboard).toEqual([
      { count: 4, name: "Lightning Bolt" },
      { count: 56, name: "Mountain" },
    ]);
  });

  it("returns null without marker", () => {
    expect(extractMtgoDecklistsData("<html></html>")).toBeNull();
  });
});
