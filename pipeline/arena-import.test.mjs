import { describe, expect, it } from "vitest";
import { arenaCardName, buildArenaImport } from "./sources/common.mjs";

describe("pipeline arenaCardName — keep in sync with src/services/arenaImport.ts", () => {
  it("keeps rooms and classic splits as Front // Back", () => {
    expect(arenaCardName("Unholy Annex // Ritual Chamber")).toBe(
      "Unholy Annex // Ritual Chamber",
    );
    expect(arenaCardName("Bedeck // Bedazzle")).toBe("Bedeck // Bedazzle");
  });

  it("strips adventure / transform / MDFC back faces", () => {
    expect(arenaCardName("Brazen Borrower // Petty Theft")).toBe("Brazen Borrower");
    expect(arenaCardName("Blightstep Pathway // Searstep Pathway")).toBe(
      "Blightstep Pathway",
    );
    expect(arenaCardName("Jennifer Walters // The Sensational She-Hulk")).toBe(
      "Jennifer Walters",
    );
  });

  it("bakes rooms into arenaImport text", () => {
    const text = buildArenaImport({
      mainboard: [
        { count: 4, name: "Unholy Annex // Ritual Chamber", layout: "split" },
        { count: 24, name: "Swamp" },
      ],
      sideboard: [],
    });
    expect(text).toContain("4 Unholy Annex // Ritual Chamber");
    expect(text).toContain("24 Swamp");
    expect(text).not.toMatch(/^4 Unholy Annex$/m);
  });
});
