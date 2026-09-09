import { describe, expect, it } from "vitest";
import { pickPreviewCards } from "./CardArt";

describe("pickPreviewCards", () => {
  it("skips Goldfish key cards that are not in the mainboard", () => {
    const arts = pickPreviewCards({
      commander: undefined,
      keyCards: [
        "Formidable Speaker",
        "Superior Spider-Man",
        "Bringer of the Last Gift",
      ],
      mainboard: [
        { name: "Formidable Speaker", count: 3, scryfallId: "a" },
        { name: "Superior Spider-Man", count: 4, scryfallId: "b" },
        { name: "Llanowar Elves", count: 4, scryfallId: "c" },
        { name: "Forest", count: 4, land: true, scryfallId: "d" },
      ],
    });
    expect(arts.map((a) => a.name)).toEqual([
      "Formidable Speaker",
      "Superior Spider-Man",
      "Llanowar Elves",
    ]);
  });

  it("matches a Goldfish key to the double-faced printing in the list", () => {
    const arts = pickPreviewCards({
      commander: undefined,
      keyCards: ["Hearth Elemental"],
      mainboard: [
        { name: "Hearth Elemental // Stoke Genius", count: 4, scryfallId: "h" },
        { name: "Opt", count: 4, scryfallId: "o" },
      ],
    });
    expect(arts[0]?.name).toBe("Hearth Elemental // Stoke Genius");
    expect(arts[0]?.scryfallId).toBe("h");
  });
});
