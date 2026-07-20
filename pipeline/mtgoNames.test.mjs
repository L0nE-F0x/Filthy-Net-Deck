import { describe, expect, it } from "vitest";
import { MTGO_NAME_MAP, normalizeMtgoCardName } from "./sources/mtgoNames.mjs";
import { parseMtgoEventLists } from "./sources/mtgo.mjs";

describe("mtgo-name-map.json (generated from Scryfall)", () => {
  it("maps the 2026-07-20 regression card: printed alias → canonical name", () => {
    expect(MTGO_NAME_MAP["Desecrex, Gift of Servitude"]).toBe(
      "Carnage, Crimson Chaos",
    );
  });

  it("has a real OM1-sized body of verified entries, none degenerate", () => {
    const entries = Object.entries(MTGO_NAME_MAP);
    expect(entries.length).toBeGreaterThanOrEqual(100);
    for (const [alias, canonical] of entries) {
      expect(alias.trim()).toBe(alias);
      expect(canonical.trim()).toBe(canonical);
      expect(alias.length).toBeGreaterThan(0);
      expect(canonical.length).toBeGreaterThan(0);
      expect(alias).not.toBe(canonical);
    }
  });
});

describe("normalizeMtgoCardName", () => {
  it("passes unknown names through unchanged (they still drop with a diagnostic)", () => {
    expect(normalizeMtgoCardName("Lightning Bolt")).toBe("Lightning Bolt");
    expect(normalizeMtgoCardName("  Opt  ")).toBe("Opt");
  });
});

describe("parseMtgoEventLists applies the normalizer and merges printings", () => {
  const row = (name, qty, sideboard = "false") => ({
    qty: String(qty),
    sideboard,
    card_attributes: { card_name: name },
  });

  it("normalizes alias rows and merges duplicate-printing rows by name", () => {
    const data = {
      description: "Test Challenge",
      decklists: [
        {
          player: "tester",
          main_deck: [
            row("Desecrex, Gift of Servitude", 2),
            // MTGO lists the same card once per printing:
            row("Kona, Rescue Beastie", 1),
            row("Kona, Rescue Beastie", 3),
            row("Opt", 4),
            row("Mountain", 49),
          ],
          sideboard_deck: [row("Desecrex, Gift of Servitude", 1)],
        },
      ],
    };
    const lists = parseMtgoEventLists(data, "https://example.test/event");
    expect(lists).toHaveLength(1);
    const { mainboard, sideboard } = lists[0];

    expect(mainboard).toContainEqual({ name: "Carnage, Crimson Chaos", count: 2 });
    expect(mainboard).toContainEqual({ name: "Kona, Rescue Beastie", count: 4 });
    expect(mainboard.reduce((n, c) => n + c.count, 0)).toBe(59);
    expect(mainboard.filter((c) => c.name === "Kona, Rescue Beastie")).toHaveLength(1);
    expect(JSON.stringify(lists[0])).not.toContain("Desecrex");
    expect(sideboard).toEqual([{ name: "Carnage, Crimson Chaos", count: 1 }]);
  });
});
