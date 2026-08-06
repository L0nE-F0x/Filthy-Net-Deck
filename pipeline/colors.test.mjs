import { describe, expect, it } from "vitest";
import {
  archetypeTheme,
  colorGroupName,
  listColorIdentity,
  reconcileArchetype,
} from "./sources/colors.mjs";

const costOf = (e) => e.cost;

describe("listColorIdentity", () => {
  it("reads the colors the nonland cards must produce", () => {
    const main = [
      { count: 4, cost: "{1}{W}" },
      { count: 4, cost: "{B}" },
      { count: 20, land: true, cost: "" },
    ];
    expect(listColorIdentity(main, costOf)).toEqual(["W", "B"]);
  });

  it("ignores hybrid pips — {1}{R/G} is castable off green alone", () => {
    const main = [
      { count: 4, cost: "{G}" },
      { count: 3, cost: "{1}{R/G}" }, // Spider Manifestation
      { count: 4, cost: "{W/U}{W/U}" }, // Skyward Spider
    ];
    expect(listColorIdentity(main, costOf)).toEqual(["G"]);
  });

  it("ignores Phyrexian and twobrid pips too", () => {
    const main = [
      { count: 4, cost: "{R}" },
      { count: 4, cost: "{2/W}" },
      { count: 4, cost: "{B/P}" },
    ];
    expect(listColorIdentity(main, costOf)).toEqual(["R"]);
  });

  it("ignores a lone stray card", () => {
    const main = [
      { count: 4, cost: "{R}" },
      { count: 1, cost: "{G}" },
    ];
    expect(listColorIdentity(main, costOf)).toEqual(["R"]);
  });

  it("ignores lands so fixing can't repaint an archetype", () => {
    const main = [
      { count: 4, cost: "{R}" },
      { count: 4, land: true, cost: "" },
    ];
    expect(listColorIdentity(main, costOf)).toEqual(["R"]);
  });
});

describe("reconcileArchetype", () => {
  it("renames a mono tile whose list plays a second color", () => {
    const r = reconcileArchetype("Mono-White Lifegain", ["W"], ["W", "B"]);
    expect(r.name).toBe("Orzhov Lifegain");
    expect(r.colors).toEqual(["W", "B"]);
    expect(r.adjusted).toBe(true);
    expect(r.added).toEqual(["B"]);
  });

  it("leaves an agreeing tile alone", () => {
    const r = reconcileArchetype("Izzet Prowess", ["U", "R"], ["U", "R"]);
    expect(r.name).toBe("Izzet Prowess");
    expect(r.adjusted).toBe(false);
  });

  it("keeps tile colors the list doesn't happen to show", () => {
    const r = reconcileArchetype("Jeskai Lessons", ["W", "U", "R"], ["U", "R"]);
    expect(r.colors).toEqual(["W", "U", "R"]);
    expect(r.name).toBe("Jeskai Lessons");
  });

  it("won't invent a color word for an archetype that has none", () => {
    const r = reconcileArchetype("Domain", ["W", "U"], ["W", "U", "B"]);
    expect(r.name).toBe("Domain");
    expect(r.colors).toEqual(["W", "U", "B"]);
    expect(r.adjusted).toBe(false);
  });
});

describe("naming helpers", () => {
  it("names color groups", () => {
    expect(colorGroupName(["B", "W"])).toBe("Orzhov");
    expect(colorGroupName(["W", "U", "R"])).toBe("Jeskai");
    expect(colorGroupName(["W", "U", "B", "R", "G"])).toBe("5c");
  });

  it("strips the color word", () => {
    expect(archetypeTheme("Mono-Black Demons")).toBe("Demons");
    expect(archetypeTheme("4c Control")).toBe("Control");
    expect(archetypeTheme("Lifegain")).toBeNull();
  });
});
