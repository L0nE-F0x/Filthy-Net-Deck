import { describe, expect, it } from "vitest";
import {
  arenaCardName,
  buildArenaImport,
  cardsToArenaLines,
  sanitizeArenaImportText,
} from "./arenaImport";

describe("arenaCardName", () => {
  it("strips double-faced / room / adventure back faces", () => {
    expect(arenaCardName("Unholy Annex // Ritual Chamber")).toBe("Unholy Annex");
    expect(arenaCardName("Jennifer Walters // The Sensational She-Hulk")).toBe(
      "Jennifer Walters",
    );
    expect(arenaCardName("Brazen Borrower // Petty Theft")).toBe("Brazen Borrower");
    expect(arenaCardName("Fable of the Mirror-Breaker // Reflection of Kiki-Jiki")).toBe(
      "Fable of the Mirror-Breaker",
    );
  });

  it("leaves single-faced names alone", () => {
    expect(arenaCardName("Lightning Bolt")).toBe("Lightning Bolt");
    expect(arenaCardName("Surrak, Elusive Hunter")).toBe("Surrak, Elusive Hunter");
  });

  it("does not strip single-slash or mid-word slashes", () => {
    expect(arenaCardName("R&D's Secret Lair")).toBe("R&D's Secret Lair");
  });
});

describe("cardsToArenaLines / buildArenaImport", () => {
  it("emits Arena-safe front-face lines", () => {
    const lines = cardsToArenaLines([
      { count: 4, name: "Lightning Bolt" },
      { count: 2, name: "Unholy Annex // Ritual Chamber" },
    ]);
    expect(lines).toBe("4 Lightning Bolt\n2 Unholy Annex");
  });

  it("builds a full Arena import block", () => {
    const text = buildArenaImport({
      mainboard: [
        { count: 4, name: "Badgermole Cub" },
        { count: 2, name: "Jennifer Walters // The Sensational She-Hulk" },
      ],
      sideboard: [{ count: 1, name: "Brazen Borrower // Petty Theft" }],
    });
    expect(text).toBe(
      [
        "Deck",
        "4 Badgermole Cub",
        "2 Jennifer Walters",
        "",
        "Sideboard",
        "1 Brazen Borrower",
      ].join("\n"),
    );
  });
});

describe("sanitizeArenaImportText", () => {
  it("fixes pre-baked feeds that still include // back faces", () => {
    const raw = [
      "Deck",
      "4 Badgermole Cub",
      "2 Jennifer Walters // The Sensational She-Hulk",
      "",
      "Sideboard",
      "1 Unholy Annex // Ritual Chamber",
    ].join("\n");
    expect(sanitizeArenaImportText(raw)).toBe(
      [
        "Deck",
        "4 Badgermole Cub",
        "2 Jennifer Walters",
        "",
        "Sideboard",
        "1 Unholy Annex",
      ].join("\n"),
    );
  });
});
