import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ArenaCardInfo } from "./arenaCards";
import type { DeckGroup } from "./deckStats";
import type { TrackedMatch } from "../types/tracker";

/**
 * Card names come from Scryfall over the network. Stubbed to a fixed table so
 * these tests pin the *selection* rules — which decks get archived and which
 * are held back — rather than re-testing the resolver.
 */
const CARDS: Record<number, ArenaCardInfo> = {
  1: { name: "Lightning Bolt", typeLine: "Instant", cmc: 1, isLand: false },
  2: { name: "Mountain", typeLine: "Basic Land — Mountain", cmc: 0, isLand: true },
  3: { name: "Abrade", typeLine: "Instant", cmc: 2, isLand: false },
} as unknown as Record<number, ArenaCardInfo>;

vi.mock("./arenaCards", () => ({
  resolveArenaCards: vi.fn(async (ids: number[]) => {
    const out: Record<number, ArenaCardInfo> = {};
    for (const id of ids) if (CARDS[id]) out[id] = CARDS[id];
    return out;
  }),
}));

const { buildDeckLibraryExport, deckExportSummary } = await import("./deckLibraryExport");

function match(over: Partial<TrackedMatch> = {}): TrackedMatch {
  return {
    matchId: "m1",
    startedAt: 1_000,
    endedAt: 2_000,
    eventId: "Ladder",
    bestOf: 1,
    myTeamId: 1,
    games: [],
    result: "win",
    deckHash: "h1",
    deckMain: [1, 1, 2, 2],
    deckSide: [3],
    ...over,
  } as TrackedMatch;
}

function deck(over: Partial<DeckGroup> = {}): DeckGroup {
  return {
    key: "k1",
    name: "Mono Red",
    matches: [match()],
    runActive: false,
    lastPlayedAt: 2_000,
    firstPlayedAt: 2_000,
    format: "standard",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildDeckLibraryExport", () => {
  it("renders a deck as Arena import text with its format label", async () => {
    const out = await buildDeckLibraryExport([deck()]);
    expect(out.entries).toHaveLength(1);
    expect(out.entries[0].name).toBe("Mono Red");
    expect(out.entries[0].format).toBe("Standard");
    expect(out.entries[0].text).toContain("Deck");
    expect(out.entries[0].text).toContain("2 Lightning Bolt");
    expect(out.entries[0].text).toContain("Sideboard");
    expect(out.entries[0].text).toContain("1 Abrade");
  });

  it("archives formats the app ships no metagame for", async () => {
    // The whole point of the ticket this shipped for: a Historic deck is still
    // the player's deck, and Arena's 100-deck cap is what makes keeping it
    // matter. Coverage of a metagame is a different question entirely.
    const out = await buildDeckLibraryExport([
      deck({ key: "a", name: "Izzet Phoenix", format: "historic" }),
      deck({ key: "b", name: "Ketramose", format: "brawl" }),
      deck({ key: "c", name: "Boros", format: "timeless" }),
    ]);
    expect(out.entries.map((e) => e.format)).toEqual(["Historic", "Brawl", "Timeless"]);
  });

  it("leaves the format off when Arena never named the queue", async () => {
    // Better a file with no format in the name than one asserting a guess.
    const out = await buildDeckLibraryExport([deck({ format: "unknown" })]);
    expect(out.entries[0].format).toBe("");
  });

  it("skips limited — a draft pool is not a deck you can rebuild", async () => {
    const out = await buildDeckLibraryExport([deck({ format: "limited" })]);
    expect(out.entries).toEqual([]);
    // Not counted as missing either: it was never a candidate.
    expect(out.missing).toBe(0);
  });

  it("counts decks with no stored list instead of writing an empty file", async () => {
    const out = await buildDeckLibraryExport([
      deck({ matches: [match({ deckMain: undefined })] }),
    ]);
    expect(out.entries).toEqual([]);
    expect(out.missing).toBe(1);
  });

  it("falls back to the cloud backup when the local log has rotated", async () => {
    // The oldest decks are the ones whose logs are gone, and they are exactly
    // the ones worth archiving. An export that quietly dropped them would be
    // missing its most valuable rows.
    const out = await buildDeckLibraryExport(
      [deck({ matches: [match({ deckMain: undefined, deckHash: "h9" })] })],
      new Map([["h9", { main: [1, 2], side: [] }]]),
    );
    expect(out.missing).toBe(0);
    expect(out.entries[0].text).toContain("1 Lightning Bolt");
  });

  it("holds back a deck whose cards have no names yet, rather than trimming it", async () => {
    // `toArenaDecklist` drops rows it cannot name, so exporting anyway writes a
    // file that looks like a decklist and is quietly two cards short.
    const out = await buildDeckLibraryExport([
      deck({ matches: [match({ deckMain: [1, 1, 999, 999] })] }),
    ]);
    expect(out.entries).toEqual([]);
    expect(out.unresolved).toBe(1);
  });

  it("resolves the whole library in one call, not one per deck", async () => {
    const { resolveArenaCards } = await import("./arenaCards");
    await buildDeckLibraryExport([
      deck({ key: "a" }),
      deck({ key: "b" }),
      deck({ key: "c" }),
    ]);
    expect(vi.mocked(resolveArenaCards)).toHaveBeenCalledTimes(1);
  });
});

describe("deckExportSummary", () => {
  it("says what was written", () => {
    const msg = deckExportSummary({ entries: [{}, {}] as never, missing: 0, unresolved: 0 }, "C:/x");
    expect(msg).toBe("Saved 2 decks to C:/x");
  });

  it("names the gaps out loud, so an incomplete archive is not a silent one", () => {
    const msg = deckExportSummary(
      { entries: [{}] as never, missing: 3, unresolved: 2 },
      "C:/x",
    );
    expect(msg).toContain("Saved 1 deck");
    expect(msg).toContain("2 held back");
    expect(msg).toContain("3 had no stored list");
  });
});
