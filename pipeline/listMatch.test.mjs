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

describe("4c Reanimator identity (2026-09-09 false positive)", () => {
  const tile = {
    name: "4c Reanimator",
    keyCards: [
      "Formidable Speaker",
      "Superior Spider-Man",
      "Bringer of the Last Gift",
    ],
  };

  const goldfishMain = [
    { count: 3, name: "Overlord of the Balemurk" },
    { count: 2, name: "Bitter Triumph" },
    { count: 1, name: "Swamp" },
    { count: 2, name: "Cavern of Souls" },
    { count: 4, name: "Bringer of the Last Gift" },
    { count: 4, name: "Breeding Pool" },
    { count: 3, name: "Wastewood Verge" },
    { count: 1, name: "Forest" },
    { count: 4, name: "Superior Spider-Man" },
    { count: 3, name: "Overgrown Tomb" },
    { count: 3, name: "Ardyn, the Usurper" },
    { count: 1, name: "Undercity Sewers" },
    { count: 2, name: "Watery Grave" },
    { count: 2, name: "Willowrush Verge" },
    { count: 4, name: "Formidable Speaker" },
    { count: 2, name: "Wistfulness" },
    { count: 4, name: "Oblivious Bookworm" },
    { count: 2, name: "Awaken the Honored Dead" },
    { count: 3, name: "Terror of the Peaks" },
    { count: 4, name: "Town Greeter" },
    { count: 2, name: "Analyze the Pollen" },
    { count: 3, name: "Starting Town" },
    { count: 1, name: "Island" },
  ];

  // Live 2026-09-09 MTGO Challenge 32 (xfile): 2/3 keys, no Bringer, Elves.
  const impostorMain = [
    { count: 4, name: "Wistfulness" },
    { count: 4, name: "Deceit" },
    { count: 4, name: "Superior Spider-Man" },
    { count: 4, name: "Llanowar Elves" },
    { count: 4, name: "Requiting Hex" },
    { count: 3, name: "Bitter Triumph" },
    { count: 2, name: "Emeritus of Ideation // Ancestral Recall" },
    { count: 3, name: "Formidable Speaker" },
    { count: 1, name: "Harvester of Misery" },
    { count: 3, name: "Overgrown Tomb" },
    { count: 4, name: "Blooming Marsh" },
    { count: 4, name: "Watery Grave" },
    { count: 2, name: "Starting Town" },
    { count: 4, name: "Gloomlake Verge" },
    { count: 2, name: "Breeding Pool" },
    { count: 1, name: "Island" },
    { count: 1, name: "Swamp" },
    { count: 1, name: "Forest" },
    { count: 2, name: "Botanical Sanctum" },
    { count: 3, name: "Awaken the Honored Dead" },
    { count: 1, name: "Roaming Throne" },
    { count: 2, name: "Winternight Stories" },
    { count: 1, name: "Cavern of Souls" },
  ];

  const goldfishList = { mainboard: goldfishMain };

  it("accepts the Goldfish representative list", () => {
    const s = scoreListForArchetype({ mainboard: goldfishMain }, tile, goldfishList);
    expect(s).not.toBeNull();
    expect(s.keyHits).toBe(3);
  });

  it("rejects a 2-key midrange pile that does not play Bringer", () => {
    expect(
      scoreListForArchetype({ mainboard: impostorMain }, tile, goldfishList),
    ).toBeNull();
  });

  it("does not pick the impostor over a real reanimator 60", () => {
    const pool = [
      { player: "xfile", mainboard: impostorMain, sideboard: [], sourceUrl: "u1", eventName: "e" },
      { player: "yukiro", mainboard: goldfishMain, sideboard: [], sourceUrl: "u2", eventName: "e" },
    ];
    const hit = pickBestListForTile(pool, tile, goldfishList);
    expect(hit?.list.player).toBe("yukiro");
  });

  it("falls through (no match) when the pool is only the impostor", () => {
    const pool = [
      { player: "xfile", mainboard: impostorMain, sideboard: [], sourceUrl: "u1", eventName: "e" },
    ];
    expect(pickBestListForTile(pool, tile, goldfishList)).toBeNull();
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
