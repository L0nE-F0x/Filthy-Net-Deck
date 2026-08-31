import { describe, expect, it } from "vitest";
import {
  distinctSeenGrpIds,
  revealedCardsOf,
  revealedListText,
  seenCardCount,
  seenCopyCount,
  seenQtyByGrpId,
  type RevealedPeek,
} from "./opponentSeen";

const peek: RevealedPeek = (id) => {
  if (id === 10)
    return { name: "Mountain", isLand: true, typeLine: "Basic Land — Mountain" };
  if (id === 20)
    return {
      name: "Slickshot Show-Off",
      isLand: false,
      typeLine: "Creature — Bird Wizard",
      artUrl: "https://example/slick.jpg",
    };
  if (id === 30)
    return {
      name: "Unholy Annex // Ritual Chamber",
      isLand: false,
      typeLine: "Enchantment — Room",
    };
  return undefined;
};

describe("distinctSeenGrpIds / seenCardCount", () => {
  it("drops non-finite and duplicate ids, keeps first-seen order", () => {
    expect(distinctSeenGrpIds([20, 10, 20, Number.NaN, 30, 10])).toEqual([
      20, 10, 30,
    ]);
    expect(seenCardCount([20, 10, 20, 30])).toBe(3);
    expect(seenCardCount(undefined)).toBe(0);
    expect(seenCardCount([])).toBe(0);
  });

  it("counts copies separately from distinct names", () => {
    expect(seenCopyCount([20, 10, 20, 30])).toBe(4);
    expect(seenCopyCount(undefined)).toBe(0);
    expect([...seenQtyByGrpId([20, 10, 20])]).toEqual([
      [20, 2],
      [10, 1],
    ]);
  });
});

describe("revealedCardsOf", () => {
  it("sorts spells before lands and leaves unresolved as Card #id", () => {
    const cards = revealedCardsOf([10, 99, 20], peek);
    expect(cards.map((c) => c.name)).toEqual([
      "Slickshot Show-Off",
      "Mountain",
      "Card #99",
    ]);
    expect(cards[0].pending).toBe(false);
    expect(cards[0].art).toBe("https://example/slick.jpg");
    expect(cards[0].qty).toBe(1);
    expect(cards[1].isLand).toBe(true);
    expect(cards[2].pending).toBe(true);
  });

  it("attaches quantity and sorts higher counts first", () => {
    const cards = revealedCardsOf([10, 20, 20, 20, 10], peek);
    expect(cards.map((c) => [c.name, c.qty])).toEqual([
      ["Slickshot Show-Off", 3],
      ["Mountain", 2],
    ]);
  });

  it("returns empty when nothing was seen", () => {
    expect(revealedCardsOf(undefined, peek)).toEqual([]);
    expect(revealedCardsOf([], peek)).toEqual([]);
  });
});

describe("revealedListText", () => {
  it("emits an Arena Deck block, keeping rooms as Front // Back", () => {
    const cards = revealedCardsOf([30, 20, 99], peek);
    expect(revealedListText(cards)).toBe(
      ["Deck", "1 Slickshot Show-Off", "1 Unholy Annex // Ritual Chamber"].join("\n"),
    );
  });

  it("writes recorded quantities into the Arena import", () => {
    const cards = revealedCardsOf([20, 20, 10, 10, 10], peek);
    expect(revealedListText(cards)).toBe(
      ["Deck", "2 Slickshot Show-Off", "3 Mountain"].join("\n"),
    );
  });

  it("returns empty when every name is still resolving", () => {
    expect(revealedListText(revealedCardsOf([7, 8], peek))).toBe("");
  });
});
