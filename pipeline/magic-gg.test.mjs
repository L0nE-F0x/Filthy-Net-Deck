import { describe, expect, it } from "vitest";
import {
  parseCardLines,
  parseMagicGgDecklists,
  unescapeArticleHtml,
} from "./sources/magic-gg.mjs";

const SAMPLE_BLOCK = `
<p>Intro text.</p>
<deck-list deck-title="Platinum-Mythic Rank Player" subtitle="" event-date="July 13, 2026" event-name="Traditional (Bo3)" format="Standard">
<main-deck>
7 Plains
4 Hallowed Fountain
3 Gleaming Bastion
2 Floodfarm Verge
2 Abandoned Air Temple
2 Multiversal Passage
1 Island
4 Starfield Shepherd
4 Sage of the Skies
4 Momo, Friendly Flier
3 The Sentry, Golden Guardian
3 Practiced Offense
3 Dust Animus
2 Sheltered by Ghosts
2 Springleaf Drum
2 Nurturing Pixie
2 Mockingbird
2 Flitterwing Nuisance
2 Seam Rip
2 Air Nomad Legacy
1 Empyrean Eagle
1 Erode
1 Haliya, Guided by Light
1 The Wondrous Wasp
</main-deck>
<side-board>
4 Clarion Conqueror
2 Seam Rip
2 Rest in Peace
</side-board>
<companion-card>
</companion-card>
</deck-list>
`;

const NUXT_ESCAPED = String.raw`window.__NUXT__=(function(){return {data:[{decklistBody:["\u003Cdeck-list deck-title=\"Pilot A\" event-name=\"Ranked\" format=\"Standard\"\u003E\n\u003Cmain-deck\u003E\n4 Lightning Bolt\n4 Monastery Swiftspear\n4 Slickshot Show-Off\n4 Play with Fire\n4 Kumano Faces Kakkazan\n4 Sokenzan, Crucible of Defiance\n20 Mountain\n4 Other Red A\n4 Other Red B\n4 Other Red C\n4 Other Red D\n\u003C\u002Fmain-deck\u003E\n\u003Cside-board\u003E\n2 Abrade\n\u003C\u002Fside-board\u003E\n\u003C\u002Fdeck-list\u003E"]}]}})();`;

describe("unescapeArticleHtml", () => {
  it("turns Nuxt unicode escapes into real tags", () => {
    const u = unescapeArticleHtml(String.raw`\u003Cmain-deck\u003E4 Bolt\u003C\u002Fmain-deck\u003E`);
    expect(u).toContain("<main-deck>");
    expect(u).toContain("</main-deck>");
  });
});

describe("parseCardLines", () => {
  it("parses qty + name and MDFC faces", () => {
    const rows = parseCardLines("4 Lightning Bolt\n1 Brazen Borrower // Petty Theft\n\nSideboard\n");
    expect(rows).toEqual([
      { count: 4, name: "Lightning Bolt" },
      { count: 1, name: "Brazen Borrower // Petty Theft" },
    ]);
  });
});

describe("parseMagicGgDecklists", () => {
  it("extracts structured main + side from real-shaped HTML", () => {
    const lists = parseMagicGgDecklists(SAMPLE_BLOCK, {
      url: "https://magic.gg/decklists/example",
      format: "standard",
    });
    expect(lists).toHaveLength(1);
    const L = lists[0];
    expect(L.player).toBe("Platinum-Mythic Rank Player");
    expect(L.eventName).toBe("Traditional (Bo3)");
    expect(L.format).toBe("standard");
    const mainN = L.mainboard.reduce((n, c) => n + c.count, 0);
    expect(mainN).toBe(60);
    expect(L.mainboard.some((c) => c.name === "Starfield Shepherd" && c.count === 4)).toBe(
      true,
    );
    expect(L.sideboard.some((c) => c.name === "Clarion Conqueror" && c.count === 4)).toBe(
      true,
    );
    expect(L.sourceUrl).toBe("https://magic.gg/decklists/example");
  });

  it("parses Nuxt-escaped decklistBody payloads", () => {
    const lists = parseMagicGgDecklists(NUXT_ESCAPED, { format: "standard" });
    expect(lists.length).toBeGreaterThanOrEqual(1);
    const mainN = lists[0].mainboard.reduce((n, c) => n + c.count, 0);
    expect(mainN).toBe(60);
    expect(lists[0].mainboard.some((c) => c.name === "Lightning Bolt")).toBe(true);
  });

  it("rejects short / draft-sized boards", () => {
    const html = `
      <deck-list deck-title="Draft" format="Standard">
        <main-deck>
          1 Island
          1 Plains
          1 Swamp
        </main-deck>
      </deck-list>`;
    expect(parseMagicGgDecklists(html)).toHaveLength(0);
  });

  it("ignores free-form text without deck-list tags (old corruption path)", () => {
    const junk = "4 Lightning Bolt 4 Monastery Swiftspear 20 Mountain and some garbage";
    expect(parseMagicGgDecklists(junk)).toHaveLength(0);
  });
});
