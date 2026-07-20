/**
 * Fixture tests for the MTGGoldfish parsers (100X-ROADMAP Phase 0, C2).
 *
 * The fixtures are REAL pages, fetched 2026-07-20 and gzipped verbatim into
 * pipeline/__fixtures__/. They freeze today's HTML shape so any parser
 * refactor that changes extraction behavior fails here first — the pipeline's
 * abort-without-writing + CI failure-issue automation stays the live-drift
 * detector; this suite is the regression net for the code itself.
 *
 * Recapture (only when Goldfish redesigns AND the parsers are updated):
 *   node --input-type=module -e "
 *     import { getText } from './pipeline/sources/common.mjs';
 *     import { writeFileSync } from 'node:fs';
 *     import { gzipSync } from 'node:zlib';
 *     const html = await getText('https://www.mtggoldfish.com/metagame/standard#paper');
 *     writeFileSync('pipeline/__fixtures__/goldfish-metagame-standard.html.gz', gzipSync(Buffer.from(html)));
 *   "
 *   …then the same for one archetype page, and update the expectations below.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseMetagameTiles, parseArchetypeDeckPage } from "./sources/goldfish.mjs";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");

function loadFixture(name) {
  return gunzipSync(readFileSync(join(fixtures, name))).toString("utf8");
}

const metagameHtml = loadFixture("goldfish-metagame-standard.html.gz");
const archetypeHtml = loadFixture(
  "goldfish-archetype-standard-selesnya-ouroboroid-woe.html.gz",
);

describe("parseMetagameTiles (real 2026-07-20 standard page)", () => {
  const tiles = parseMetagameTiles(metagameHtml);

  it("extracts every archetype tile", () => {
    expect(tiles.map((t) => t.name)).toEqual([
      "Selesnya Ouroboroid",
      "Jeskai Lessons",
      "Izzet Prowess",
      "4c Control",
      "Izzet Spellementals",
      "Dimir Excruciator",
      "Mono-Green Landfall",
      "Mardu Discard",
      "Izzet Lessons",
      "4c Gearhulk",
      "Selesnya Landfall",
      "Mono-Red Aggro",
      "Izzet Spells",
      "Azorius Momo",
      "Selesnya Gearhulk",
    ]);
  });

  it("extracts the full first tile: name, slug, colors, meta %, sample, key cards, url", () => {
    expect(tiles[0]).toEqual({
      name: "Selesnya Ouroboroid",
      slug: "standard-selesnya-ouroboroid-woe",
      colors: ["W", "G"],
      metaPct: 16.2,
      sampleSize: 250,
      keyCards: ["Badgermole Cub", "Brightglass Gearhulk", "Practiced Offense"],
      url: "https://www.mtggoldfish.com/archetype/standard-selesnya-ouroboroid-woe",
    });
  });

  it("gets meta %, colors, and key cards on every tile of this page", () => {
    for (const t of tiles) {
      expect(Number.isFinite(t.metaPct), `${t.name} metaPct`).toBe(true);
      expect(t.colors.length, `${t.name} colors`).toBeGreaterThan(0);
      expect(t.keyCards.length, `${t.name} keyCards`).toBeGreaterThan(0);
      expect(t.keyCards.length).toBeLessThanOrEqual(3);
      expect(t.slug).toMatch(/^[a-z0-9-]+$/);
      expect(t.url).toBe(`https://www.mtggoldfish.com/archetype/${t.slug}`);
    }
  });

  it("dedupes tiles by slug (pages repeat tiles per view)", () => {
    const slugs = tiles.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("returns [] for junk input instead of throwing", () => {
    expect(parseMetagameTiles("")).toEqual([]);
    expect(parseMetagameTiles("<html><body>redesigned</body></html>")).toEqual([]);
  });
});

describe("parseArchetypeDeckPage (real 2026-07-20 archetype page)", () => {
  const deck = parseArchetypeDeckPage(archetypeHtml);

  it("parses the embedded deck_input list", () => {
    expect(deck).not.toBeNull();
    expect(deck.mainCount).toBe(60);
    expect(deck.mainboard).toHaveLength(20);
    expect(deck.sideboard).toHaveLength(9);
    expect(deck.sideboard.reduce((s, c) => s + c.count, 0)).toBe(15);
  });

  it("extracts identity fields", () => {
    expect(deck.deckId).toBe("7874750");
    expect(deck.deckName).toBe("Selesnya Ouroboroid");
    expect(deck.goldfishFormat).toBe("standard");
    expect(deck.commander).toBeUndefined();
  });

  it("keeps sane card rows (count ≥ 1, non-empty names, duplicates merged)", () => {
    expect(deck.mainboard[0]).toEqual({ count: 3, name: "Abandoned Air Temple" });
    expect(deck.sideboard[0]).toEqual({ count: 1, name: "Erode" });
    const names = deck.mainboard.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    for (const c of [...deck.mainboard, ...deck.sideboard]) {
      expect(c.count).toBeGreaterThanOrEqual(1);
      expect(c.name.trim().length).toBeGreaterThan(0);
    }
  });

  it("returns null for junk input instead of throwing", () => {
    expect(parseArchetypeDeckPage("")).toBeNull();
    expect(parseArchetypeDeckPage("<html>no deck form here</html>")).toBeNull();
  });
});
