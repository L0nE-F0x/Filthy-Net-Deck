import { describe, expect, it } from "vitest";
import { bestPersonalArchetype, personalVsMeta } from "./personalMeta";
import type { Deck } from "../types/meta";
import type { TrackedMatch } from "../types/tracker";

const decks = [
  {
    id: "1",
    name: "Izzet Prowess",
    format: "standard",
    mode: "bo1",
    tier: 1,
    colors: ["U", "R"],
    archetype: "Izzet Prowess",
    description: "",
    mainboard: [],
    sideboard: [],
    matchups: [],
    sideboardGuide: [],
    arenaImport: "",
    sources: [],
    metaShare: 12.3,
    rank: 1,
  },
  {
    id: "2",
    name: "Domain",
    format: "standard",
    mode: "bo1",
    tier: 1,
    colors: ["W", "U", "B", "R", "G"],
    archetype: "Domain",
    description: "",
    mainboard: [],
    sideboard: [],
    matchups: [],
    sideboardGuide: [],
    arenaImport: "",
    sources: [],
    metaShare: 10,
    rank: 2,
  },
] as Deck[];

function m(
  deckName: string,
  result: "win" | "loss",
  id: string,
): TrackedMatch {
  return {
    matchId: id,
    startedAt: 1,
    endedAt: 2,
    eventId: "Ladder",
    bestOf: 1,
    myTeamId: 0,
    games: [],
    result,
    deckName,
  };
}

describe("personalVsMeta", () => {
  it("joins personal record onto meta board", () => {
    const rows = personalVsMeta(
      [
        m("Izzet Prowess", "win", "a"),
        m("Izzet Prowess", "win", "b"),
        m("Izzet Prowess", "loss", "c"),
        m("Domain", "loss", "d"),
      ],
      decks,
    );
    const izzet = rows.find((r) => r.archetype === "Izzet Prowess")!;
    expect(izzet.yourWins).toBe(2);
    expect(izzet.yourLosses).toBe(1);
    expect(izzet.yourWinrate).toBeCloseTo(2 / 3);
    expect(izzet.metaShare).toBe(12.3);
    const best = bestPersonalArchetype(rows, 3);
    expect(best?.archetype).toBe("Izzet Prowess");
  });
});
