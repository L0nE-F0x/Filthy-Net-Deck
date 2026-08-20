import { describe, expect, it } from "vitest";
import type { ArenaCardInfo } from "./arenaCards";
import { deckSlug, toArenaDecklist } from "./arenaExport";
import { parseDeckText } from "./arenaImport";

const CARDS: Record<number, ArenaCardInfo> = {
  1: { name: "Mountain", cmc: 0, isLand: true },
  2: { name: "Monastery Swiftspear", cmc: 1 },
  3: { name: "Abrade", cmc: 2 },
  4: { name: "Urabrask's Forge", cmc: 4 },
  5: { name: "Unholy Annex // Ritual Chamber", cmc: 4 },
};

describe("toArenaDecklist", () => {
  it("renders quantities under a Deck header, sorted by mana value", () => {
    const { text, main, side, unresolved } = toArenaDecklist(
      [3, 3, 1, 1, 1, 2, 2, 2, 2],
      [],
      CARDS,
    );
    expect(text).toBe(
      ["Deck", "3 Mountain", "4 Monastery Swiftspear", "2 Abrade"].join("\n"),
    );
    expect(main).toBe(9);
    expect(side).toBe(0);
    expect(unresolved).toBe(0);
  });

  it("appends a Sideboard section only when there is one", () => {
    expect(toArenaDecklist([2], [], CARDS).text).toBe("Deck\n1 Monastery Swiftspear");
    expect(toArenaDecklist([2], [3, 3], CARDS).text).toBe(
      ["Deck", "1 Monastery Swiftspear", "", "Sideboard", "2 Abrade"].join("\n"),
    );
  });

  it("counts ids it cannot name and leaves them out of the text", () => {
    const r = toArenaDecklist([2, 2, 999, 999, 999], [], CARDS);
    // The caller refuses to publish on unresolved > 0 — a "4 Card 999" line is
    // useless to whoever copies it.
    expect(r.unresolved).toBe(1);
    expect(r.text).toBe("Deck\n2 Monastery Swiftspear");
    expect(r.main).toBe(5);
  });

  it("returns empty text for an empty mainboard", () => {
    expect(toArenaDecklist([], [3], CARDS).text).toBe("");
    expect(toArenaDecklist(undefined, undefined, CARDS).text).toBe("");
  });

  it("ignores non-finite ids", () => {
    const r = toArenaDecklist([2, NaN, Infinity], [], CARDS);
    expect(r.text).toBe("Deck\n1 Monastery Swiftspear");
    expect(r.main).toBe(1);
  });

  it("is stable across two renders of the same list", () => {
    const a = toArenaDecklist([4, 1, 2, 3], [], CARDS).text;
    const b = toArenaDecklist([3, 2, 1, 4], [], CARDS).text;
    expect(a).toBe(b);
  });

  it("writes the front face only, because Arena rejects '//' names", () => {
    expect(toArenaDecklist([5, 5], [], CARDS).text).toBe("Deck\n2 Unholy Annex");
  });

  it("round-trips through the importer", () => {
    const { text } = toArenaDecklist([2, 2, 2, 2, 1, 1], [3, 3], CARDS);
    const parsed = parseDeckText(text);
    expect(parsed.main).toEqual([
      { name: "Mountain", count: 2 },
      { name: "Monastery Swiftspear", count: 4 },
    ]);
    expect(parsed.side).toEqual([{ name: "Abrade", count: 2 }]);
    expect(parsed.skipped).toEqual([]);
  });
});

describe("deckSlug", () => {
  it("matches what public.deck_slugify() would assign", () => {
    expect(deckSlug("Dwarven Weapons")).toBe("dwarven-weapons");
    expect(deckSlug("Mono-Red Dragons!")).toBe("mono-red-dragons");
    expect(deckSlug("  Azorius  Control  ")).toBe("azorius-control");
    expect(deckSlug("Bo1 — Mythic 🏆 Rank")).toBe("bo1-mythic-rank");
  });

  it("never returns an empty slug", () => {
    expect(deckSlug("")).toBe("deck");
    expect(deckSlug("!!!")).toBe("deck");
    expect(deckSlug("🔥")).toBe("deck");
  });

  it("caps length without leaving a trailing dash", () => {
    const slug = deckSlug("a".repeat(40) + " " + "b".repeat(40));
    expect(slug.length).toBeLessThanOrEqual(48);
    expect(slug.endsWith("-")).toBe(false);
  });
});
