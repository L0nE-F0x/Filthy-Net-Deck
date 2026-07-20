import { beforeEach, describe, expect, it } from "vitest";
import { suggestOpponentTag } from "./tagSuggest";
import type { Deck } from "../types/meta";
import type { TrackedMatch } from "../types/tracker";

function memStorage() {
  const mem = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v);
      },
      removeItem: (k: string) => {
        mem.delete(k);
      },
    },
    configurable: true,
  });
}

function deck(): Deck {
  return {
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
}

const names: Record<number, string> = {
  1: "Monastery Swiftspear",
  2: "Slickshot Show-Off",
  3: "Play with Fire",
};

function match(over: Partial<TrackedMatch>): TrackedMatch {
  return {
    matchId: "m1",
    startedAt: 1,
    endedAt: 2,
    eventId: "Ladder",
    bestOf: 1,
    myTeamId: 1,
    games: [],
    result: "win",
    opponentName: "Bob",
    opponentSeen: [1, 2, 3],
    ...over,
  };
}

describe("suggestOpponentTag", () => {
  beforeEach(() => memStorage());

  it("suggests when B1 is confident and untagged", () => {
    const s = suggestOpponentTag(match({}), (id) => names[id] ?? null, [deck()], {
      minHits: 2,
      minConfidence: 0.3,
    });
    expect(s?.archetype).toBe("Izzet Prowess");
    expect(s?.opponentName).toBe("Bob");
  });

  it("returns null without opponent name or seen cards", () => {
    expect(
      suggestOpponentTag(
        match({ opponentName: undefined, opponentSeen: [1, 2, 3] }),
        (id) => names[id] ?? null,
        [deck()],
      ),
    ).toBeNull();
    expect(
      suggestOpponentTag(
        match({ opponentSeen: [] }),
        (id) => names[id] ?? null,
        [deck()],
      ),
    ).toBeNull();
  });
});
