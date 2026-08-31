import { describe, expect, it } from "vitest";
import {
  arenaCardName,
  buildArenaImport,
  cardsToArenaLines,
  parseDeckText,
  sanitizeArenaImportText,
} from "./arenaImport";

describe("arenaCardName", () => {
  it("keeps rooms and classic splits as Front // Back", () => {
    // Live 2026-09-01: Arena rejects "Unholy Annex" and accepts the full name.
    expect(arenaCardName("Unholy Annex // Ritual Chamber")).toBe(
      "Unholy Annex // Ritual Chamber",
    );
    expect(arenaCardName("Bedeck // Bedazzle")).toBe("Bedeck // Bedazzle");
    expect(arenaCardName("Wear // Tear")).toBe("Wear // Tear");
    expect(
      arenaCardName("Unholy Annex // Ritual Chamber", { layout: "split" }),
    ).toBe("Unholy Annex // Ritual Chamber");
  });

  it("strips adventure / transform / MDFC back faces", () => {
    expect(arenaCardName("Jennifer Walters // The Sensational She-Hulk")).toBe(
      "Jennifer Walters",
    );
    expect(arenaCardName("Brazen Borrower // Petty Theft")).toBe("Brazen Borrower");
    expect(arenaCardName("Fable of the Mirror-Breaker // Reflection of Kiki-Jiki")).toBe(
      "Fable of the Mirror-Breaker",
    );
    expect(arenaCardName("Blightstep Pathway // Searstep Pathway")).toBe(
      "Blightstep Pathway",
    );
    expect(
      arenaCardName("Brazen Borrower // Petty Theft", { layout: "adventure" }),
    ).toBe("Brazen Borrower");
  });

  it("layout split beats a name that would otherwise strip", () => {
    expect(
      arenaCardName("Alive // Well", { layout: "split" }),
    ).toBe("Alive // Well");
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
  it("emits rooms with both faces and MDFCs as the front face", () => {
    const lines = cardsToArenaLines([
      { count: 4, name: "Lightning Bolt" },
      { count: 2, name: "Unholy Annex // Ritual Chamber" },
      { count: 4, name: "Blightstep Pathway // Searstep Pathway" },
    ]);
    expect(lines).toBe(
      "4 Lightning Bolt\n2 Unholy Annex // Ritual Chamber\n4 Blightstep Pathway",
    );
  });

  it("builds a full Arena import block", () => {
    const text = buildArenaImport({
      mainboard: [
        { count: 4, name: "Badgermole Cub" },
        { count: 2, name: "Jennifer Walters // The Sensational She-Hulk" },
        { count: 4, name: "Unholy Annex // Ritual Chamber", layout: "split" },
      ],
      sideboard: [{ count: 1, name: "Brazen Borrower // Petty Theft" }],
    });
    expect(text).toBe(
      [
        "Deck",
        "4 Badgermole Cub",
        "2 Jennifer Walters",
        "4 Unholy Annex // Ritual Chamber",
        "",
        "Sideboard",
        "1 Brazen Borrower",
      ].join("\n"),
    );
  });
});

describe("sanitizeArenaImportText", () => {
  it("strips MDFC/transform back faces and keeps rooms", () => {
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
        "1 Unholy Annex // Ritual Chamber",
      ].join("\n"),
    );
  });
});

describe("parseDeckText", () => {
  it("parses an Arena export with headers and set suffixes", () => {
    const text = [
      "About",
      "Name My Gruul Brew",
      "",
      "Deck",
      "4 Shock (M21) 159",
      "4x Llanowar Elves",
      "20 Mountain",
      "",
      "Sideboard",
      "2 Abrade (VOW) 139",
    ].join("\n");
    const p = parseDeckText(text);
    expect(p.main).toEqual([
      { name: "Shock", count: 4 },
      { name: "Llanowar Elves", count: 4 },
      { name: "Mountain", count: 20 },
    ]);
    expect(p.side).toEqual([{ name: "Abrade", count: 2 }]);
    expect(p.skipped).toEqual([]);
  });

  it("splits MTGO-style lists on the blank line after a real mainboard", () => {
    const main = Array.from({ length: 15 }, (_, i) => `4 Card ${i + 1}`).join("\n");
    const p = parseDeckText(`${main}\n\n3 Duress\n2 Rest in Peace`);
    expect(p.main).toHaveLength(15);
    expect(p.side).toEqual([
      { name: "Duress", count: 3 },
      { name: "Rest in Peace", count: 2 },
    ]);
  });

  it("keeps early blank lines in the mainboard and reports noise", () => {
    const p = parseDeckText("4 Shock\n\n4 Opt\nnot a card line");
    expect(p.main).toEqual([
      { name: "Shock", count: 4 },
      { name: "Opt", count: 4 },
    ]);
    expect(p.side).toEqual([]);
    expect(p.skipped).toEqual(["not a card line"]);
  });

  it("ignores commander/companion blocks but resumes on card lines", () => {
    const p = parseDeckText("Companion\n1 Lurrus of the Dream-Den\nDeck\n4 Shock");
    expect(p.main).toEqual([{ name: "Shock", count: 4 }]);
  });
});
