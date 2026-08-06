import { describe, expect, it } from "vitest";
import {
  archetypeTheme,
  colorGroupName,
  listColorIdentity,
  reconcileArchetype,
} from "./sources/colors.mjs";

const colorsOf = (e) => e.colors;

describe("listColorIdentity", () => {
  it("reads the colors the nonland cards actually need", () => {
    const main = [
      { count: 4, colors: ["W"] },
      { count: 4, colors: ["B"] }, // Ruin-Lurker Bat
      { count: 20, land: true, colors: ["W"] },
    ];
    expect(listColorIdentity(main, colorsOf)).toEqual(["W", "B"]);
  });

  it("ignores a lone stray card", () => {
    const main = [
      { count: 4, colors: ["R"] },
      { count: 1, colors: ["G"] },
    ];
    expect(listColorIdentity(main, colorsOf)).toEqual(["R"]);
  });

  it("ignores lands so fixing can't repaint an archetype", () => {
    const main = [
      { count: 4, colors: ["R"] },
      { count: 4, land: true, colors: ["U", "R"] },
    ];
    expect(listColorIdentity(main, colorsOf)).toEqual(["R"]);
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
