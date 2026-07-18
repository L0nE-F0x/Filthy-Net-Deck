import { describe, expect, it } from "vitest";
import {
  buildInsightChips,
  buildSeasonStory,
  compareDecks,
  recordVsArchetypeTag,
} from "./statsInsights";
import type { TrackedMatch } from "../types/tracker";

let n = 0;
function m(
  partial: Partial<TrackedMatch> & {
    result: TrackedMatch["result"];
    endedAt: number;
  },
): TrackedMatch {
  return {
    matchId: `t${n++}`,
    startedAt: partial.endedAt - 1000,
    endedAt: partial.endedAt,
    eventId: "Ladder",
    bestOf: 1,
    myTeamId: 1,
    games: partial.games ?? [],
    result: partial.result,
    deckName: partial.deckName,
    deckId: partial.deckId,
    myRank: partial.myRank,
    opponentName: partial.opponentName,
  };
}

const JUL = (d: number) => new Date(2026, 6, d, 12).getTime();

describe("buildInsightChips", () => {
  it("flags a cold deck with enough sample", () => {
    const matches: TrackedMatch[] = [];
    for (let i = 0; i < 6; i++) {
      matches.push(
        m({
          result: i === 0 ? "win" : "loss",
          endedAt: JUL(i + 1),
          deckName: "Bad Deck",
          deckId: "bad",
        }),
      );
    }
    for (let i = 0; i < 6; i++) {
      matches.push(
        m({
          result: "win",
          endedAt: JUL(10 + i),
          deckName: "Good Deck",
          deckId: "good",
        }),
      );
    }
    const chips = buildInsightChips(matches);
    expect(chips.some((c) => c.id === "worst-deck" && c.deckKey)).toBe(true);
    expect(chips.some((c) => c.id === "hot-deck")).toBe(true);
  });
});

describe("buildSeasonStory", () => {
  it("summarizes peak and best deck", () => {
    const matches = [
      m({ result: "win", endedAt: JUL(1), deckName: "A", deckId: "a", myRank: "Gold 4" }),
      m({ result: "win", endedAt: JUL(2), deckName: "A", deckId: "a", myRank: "Gold 2" }),
      m({ result: "loss", endedAt: JUL(3), deckName: "B", deckId: "b", myRank: "Gold 2" }),
      m({ result: "win", endedAt: JUL(4), deckName: "A", deckId: "a", myRank: "Gold 1" }),
    ];
    const story = buildSeasonStory(matches, "2026-07");
    expect(story.wins).toBe(3);
    expect(story.losses).toBe(1);
    expect(story.peakRank?.score).toBeGreaterThan(0);
    expect(story.bestDeckName).toBe("A");
  });
});

describe("compareDecks", () => {
  it("compares two tracker decks", () => {
    const matches = [
      m({ result: "win", endedAt: JUL(1), deckName: "A", deckId: "a" }),
      m({ result: "win", endedAt: JUL(2), deckName: "A", deckId: "a" }),
      m({ result: "loss", endedAt: JUL(3), deckName: "B", deckId: "b" }),
      m({ result: "loss", endedAt: JUL(4), deckName: "B", deckId: "b" }),
    ];
    const cmp = compareDecks(matches, "a", "b");
    expect(cmp).not.toBeNull();
    expect(cmp!.a.wins).toBe(2);
    expect(cmp!.b.losses).toBe(2);
    expect(cmp!.a.rate).toBe(1);
    expect(cmp!.b.rate).toBe(0);
  });

  it("returns null for same key", () => {
    expect(compareDecks([], "a", "a")).toBeNull();
  });
});

describe("recordVsArchetypeTag", () => {
  it("counts wins/losses vs tagged opponents", () => {
    const matches = [
      m({ result: "win", endedAt: JUL(1), opponentName: "Alice" }),
      m({ result: "loss", endedAt: JUL(2), opponentName: "Bob" }),
      m({ result: "win", endedAt: JUL(3), opponentName: "Alice" }),
    ];
    const notes = {
      alice: { tag: "Izzet Prowess" },
      bob: { tag: "Dimir" },
    };
    const rec = recordVsArchetypeTag(
      matches,
      "Izzet Prowess",
      notes,
      (n) => (n ?? "").trim().toLowerCase() || "unknown",
    );
    expect(rec.wins).toBe(2);
    expect(rec.losses).toBe(0);
  });
});
