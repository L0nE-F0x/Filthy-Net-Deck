import { describe, expect, it } from "vitest";
import { displayNameProblem } from "./sync";
import { labelFromSlug } from "./archetypeSlug";

describe("displayNameProblem", () => {
  it("allows blank — the page then shows the handle", () => {
    expect(displayNameProblem("")).toBeNull();
    expect(displayNameProblem("   ")).toBeNull();
  });

  it("allows ordinary names", () => {
    expect(displayNameProblem("L0nE-F0x")).toBeNull();
    expect(displayNameProblem("Brew Lab")).toBeNull();
  });

  it("rejects anything that could break out of the page", () => {
    // The value is rendered into a public HTML page and its OG tags.
    expect(displayNameProblem("<script>")).toMatch(/angle brackets/i);
    expect(displayNameProblem("a>b")).toMatch(/angle brackets/i);
    expect(displayNameProblem("line\nbreak")).toMatch(/angle brackets|control/i);
  });

  it("caps the length", () => {
    expect(displayNameProblem("x".repeat(41))).toMatch(/40 characters/i);
    expect(displayNameProblem("x".repeat(40))).toBeNull();
  });
});

describe("labelFromSlug abbreviations", () => {
  it("uppercases colour shorthand instead of title-casing it", () => {
    // Reported from the first live profile page: "Uw Control".
    expect(labelFromSlug("standard-uw-control")).toBe("UW Control");
    expect(labelFromSlug("standard-ub-midrange")).toBe("UB Midrange");
    expect(labelFromSlug("pioneer-wubrg-control")).toBe("WUBRG Control");
  });

  it("handles colour counts", () => {
    expect(labelFromSlug("standard-4c-control")).toBe("4C Control");
    expect(labelFromSlug("standard-5c-ramp")).toBe("5C Ramp");
  });

  it("still title-cases ordinary words", () => {
    expect(labelFromSlug("standard-mono-black-demons")).toBe("Mono Black Demons");
    expect(labelFromSlug("standard-selesnya-ouroboroid")).toBe("Selesnya Ouroboroid");
  });

  it("drops the format prefix but keeps a bare slug intact", () => {
    expect(labelFromSlug("standard-azorius-control")).toBe("Azorius Control");
    expect(labelFromSlug("azorius-control")).toBe("Azorius Control");
  });
});
