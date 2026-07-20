import { describe, expect, it } from "vitest";
import { matchEndToastBody } from "./matchNotify";
import type { TrackedMatch } from "../types/tracker";
import type { Deck } from "../types/meta";

function match(
  partial: Partial<TrackedMatch> &
    Pick<TrackedMatch, "matchId" | "endedAt" | "result">,
): TrackedMatch {
  return {
    startedAt: partial.endedAt - 1000,
    eventId: "Ladder",
    bestOf: 1,
    myTeamId: 0,
    games: [],
    ...partial,
  };
}

describe("matchEndToastBody", () => {
  it("includes result, opponent, and season WR", () => {
    const m = match({
      matchId: "n",
      endedAt: Date.parse("2026-07-15T12:00:00"),
      result: "win",
      opponentName: "Bob",
      deckName: "Izzet",
      deckId: "izz",
    });
    const hist = [
      m,
      match({
        matchId: "o",
        endedAt: Date.parse("2026-07-14T12:00:00"),
        result: "loss",
        deckName: "Izzet",
        deckId: "izz",
      }),
    ];
    const body = matchEndToastBody(m, hist);
    expect(body).toContain("Win vs Bob");
    expect(body).toContain("50% this season");
  });

  it("appends archetype when B1 guess works", () => {
    const deck: Deck = {
      id: "std-izzet",
      name: "Izzet Prowess",
      format: "standard",
      mode: "bo1",
      tier: 1,
      colors: ["U", "R"],
      archetype: "Izzet Prowess",
      description: "",
      mainboard: [
        { count: 4, name: "Monastery Swiftspear" },
        { count: 4, name: "Slickshot Show-Off" },
        { count: 4, name: "Play with Fire" },
        { count: 4, name: "Mountain", land: true },
      ],
      sideboard: [],
      matchups: [],
      sideboardGuide: [],
      arenaImport: "",
      sources: [],
      keyCards: ["Monastery Swiftspear"],
    };
    const names: Record<number, string> = {
      1: "Monastery Swiftspear",
      2: "Slickshot Show-Off",
      3: "Play with Fire",
    };
    const a = match({
      matchId: "a",
      endedAt: 1,
      result: "win",
      opponentName: "X",
      opponentSeen: [1, 2, 3],
      deckId: "d",
    });
    const b = match({
      matchId: "b",
      endedAt: 2,
      result: "loss",
      opponentName: "Y",
      opponentSeen: [1, 2, 3],
      deckId: "d",
    });
    const body = matchEndToastBody(b, [b, a], {
      resolveName: (id) => names[id] ?? null,
      candidates: [deck],
    });
    expect(body).toContain("Izzet Prowess");
    expect(body).toMatch(/you 1–1|you 1-1/);
  });
});
