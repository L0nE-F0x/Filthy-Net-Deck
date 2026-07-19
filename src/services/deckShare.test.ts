import { describe, expect, it } from "vitest";
import { aggregateDeck, manaColorOf } from "./deckShare";
import type { ArenaCardInfo } from "./arenaCards";

describe("manaColorOf", () => {
  it("reads a single color, colorless, and multicolor", () => {
    expect(manaColorOf("{2}{U}{U}")).toBe("u");
    expect(manaColorOf("{G}")).toBe("g");
    expect(manaColorOf("{3}")).toBe("c");
    expect(manaColorOf(null)).toBe("c");
    expect(manaColorOf("{1}{W}{B}")).toBe("multi");
  });

  it("counts every color inside a hybrid symbol", () => {
    expect(manaColorOf("{W/U}")).toBe("multi");
    expect(manaColorOf("{G/P}")).toBe("g"); // Phyrexian green is still mono
  });
});

describe("aggregateDeck", () => {
  const cards: Record<number, ArenaCardInfo> = {
    1: { name: "Mountain", typeLine: "Basic Land — Mountain", manaCost: "", cmc: 0 },
    2: { name: "Monastery Swiftspear", typeLine: "Creature — Human Monk", manaCost: "{R}", cmc: 1 },
    3: { name: "Lightning Bolt", typeLine: "Instant", manaCost: "{R}", cmc: 1 },
    4: { name: "Slickshot Show-Off", typeLine: "Creature — Bird", manaCost: "{1}{R}", cmc: 2 },
  };

  it("counts copies, groups creatures/spells/lands, sorts by cmc", () => {
    const main = [2, 2, 2, 2, 4, 4, 3, 3, 3, 3, 1, 1, 1]; // 4x Swift, 2x Show-Off, 4x Bolt, 3x Mtn
    const list = aggregateDeck(main, [3, 3], cards);

    expect(list.total).toBe(13);
    expect(list.sideboard).toBe(2);
    expect(list.unresolved).toBe(0);
    expect(list.groups.map((g) => g.id)).toEqual(["creature", "spell", "land"]);

    const creatures = list.groups[0];
    expect(creatures.count).toBe(6); // 4 + 2
    // cmc 1 (Swiftspear) before cmc 2 (Show-Off)
    expect(creatures.rows.map((r) => r.name)).toEqual([
      "Monastery Swiftspear",
      "Slickshot Show-Off",
    ]);
    expect(creatures.rows[0].qty).toBe(4);
    expect(creatures.rows[0].color).toBe("r");

    expect(list.groups[1].id).toBe("spell");
    expect(list.groups[1].rows[0].name).toBe("Lightning Bolt");
    expect(list.groups[2].rows[0].name).toBe("Mountain");
  });

  it("falls back to Card {id} and counts unresolved ids", () => {
    const list = aggregateDeck([99, 99], undefined, cards);
    expect(list.total).toBe(2);
    expect(list.unresolved).toBe(1);
    const row = list.groups.flatMap((g) => g.rows).find((r) => r.id === 99);
    expect(row?.name).toBe("Card 99");
    expect(row?.unresolved).toBe(true);
  });

  it("handles an empty deck", () => {
    const list = aggregateDeck([], [], {});
    expect(list.total).toBe(0);
    expect(list.groups).toEqual([]);
  });
});
