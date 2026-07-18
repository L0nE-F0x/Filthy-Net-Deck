import { describe, expect, it } from "vitest";
import { deckRotationImpact, rotationWhen } from "./rotationImpact";
import type { RotationImpact } from "../types/sets";
import type { CardEntry, FormatId } from "../types/meta";

const rotation: RotationImpact = {
  nextDate: null,
  roughLabel: "Q1 2027",
  setCodes: ["woe", "blb"],
  cardNames: ["sheltered by ghosts", "beza, the bounding spring", "island // island"],
};

function deck(
  main: CardEntry[],
  side: CardEntry[] = [],
  format: FormatId = "standard",
) {
  return { format, mainboard: main, sideboard: side };
}

const c = (name: string, count: number): CardEntry => ({ name, count });

describe("deckRotationImpact", () => {
  it("returns null for non-Standard decks", () => {
    expect(deckRotationImpact(deck([c("Sheltered by Ghosts", 4)], [], "pioneer"), rotation)).toBeNull();
  });

  it("returns null when there's no rotation data", () => {
    expect(deckRotationImpact(deck([c("Sheltered by Ghosts", 4)]), null)).toBeNull();
  });

  it("counts rotating main + sideboard copies", () => {
    const r = deckRotationImpact(
      deck([c("Sheltered by Ghosts", 4), c("Some Staying Card", 3)], [c("Beza, the Bounding Spring", 2)]),
      rotation,
    );
    expect(r).not.toBeNull();
    expect(r!.mainCopies).toBe(4);
    expect(r!.sideCopies).toBe(2);
    expect(r!.distinct).toBe(2);
    expect(r!.hits[0].name).toBe("Sheltered by Ghosts"); // most copies first
  });

  it("never counts basic lands as rotating", () => {
    const r = deckRotationImpact(deck([c("Island", 24)]), rotation);
    expect(r!.hits).toHaveLength(0);
    expect(r!.mainCopies).toBe(0);
  });

  it("matches an MDFC front face against the rotation list", () => {
    const r = deckRotationImpact(deck([c("Island // Island", 1)]), rotation);
    // this is a made-up MDFC name in the list; front-face match should hit
    expect(r!.distinct).toBe(1);
  });

  it("reports zero cleanly when nothing rotates", () => {
    const r = deckRotationImpact(deck([c("Some Staying Card", 4)]), rotation);
    expect(r).not.toBeNull();
    expect(r!.distinct).toBe(0);
    expect(r!.hits).toHaveLength(0);
  });
});

describe("rotationWhen", () => {
  it("prefers an exact date", () => {
    expect(rotationWhen({ nextDate: "2027-01-15", roughLabel: "Q1 2027" })).toContain("2027");
  });
  it("falls back to the rough label", () => {
    expect(rotationWhen({ nextDate: null, roughLabel: "Q1 2027" })).toBe("Q1 2027");
  });
  it("has a final fallback", () => {
    expect(rotationWhen({ nextDate: null, roughLabel: null })).toBe("next rotation");
  });
});
