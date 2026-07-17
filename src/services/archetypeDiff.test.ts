import { describe, expect, it } from "vitest";
import {
  diffArchetypeRanks,
  diffCardLists,
  findDeckList,
} from "./archetypeDiff";

describe("diffCardLists", () => {
  it("detects adds, cuts, and count changes", () => {
    const prev = [
      { name: "Lightning Bolt", count: 4 },
      { name: "Mountain", count: 20 },
    ];
    const next = [
      { name: "Lightning Bolt", count: 3 },
      { name: "Shock", count: 4 },
      { name: "Mountain", count: 20 },
    ];
    const d = diffCardLists(prev, next);
    expect(d.identical).toBe(false);
    expect(d.added).toEqual([{ name: "Shock", from: 0, to: 4 }]);
    expect(d.removed).toEqual([]);
    expect(d.changed).toEqual([{ name: "Lightning Bolt", from: 4, to: 3 }]);
  });

  it("returns identical for same multiset", () => {
    const list = [
      { name: "A", count: 2 },
      { name: "B", count: 1 },
    ];
    expect(diffCardLists(list, list).identical).toBe(true);
  });
});

describe("diffArchetypeRanks", () => {
  it("classifies rose / fell / entered / left", () => {
    const moves = diffArchetypeRanks(
      ["Izzet Prowess", "Domain", "Dimir Mid"],
      ["Domain", "Izzet Prowess", "Boros Burn"],
    );
    const by = Object.fromEntries(moves.map((m) => [m.name, m]));
    expect(by["Izzet Prowess"].kind).toBe("fell");
    expect(by.Domain.kind).toBe("rose");
    expect(by["Boros Burn"].kind).toBe("entered");
    expect(by["Dimir Mid"].kind).toBe("left");
  });
});

describe("findDeckList", () => {
  it("locates mainboard by format/mode/name", () => {
    const decks = {
      a: {
        name: "Izzet Prowess",
        format: "standard",
        mode: "bo1",
        mainboard: [{ name: "Slickshot Show-Off", count: 4 }],
      },
    };
    const list = findDeckList(decks, "standard", "bo1", "Izzet Prowess");
    expect(list).toEqual([{ name: "Slickshot Show-Off", count: 4 }]);
    expect(findDeckList(decks, "pioneer", "bo1", "Izzet Prowess")).toBeNull();
  });
});
