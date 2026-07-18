import { describe, expect, it } from "vitest";
import {
  arsenalRiskFromNamedLists,
  buildNearRotationHero,
  buildRotationRoster,
} from "./formatHubExtras";
import type { Deck } from "../types/meta";
import type { RotationImpact } from "../types/sets";

function deck(id: string, name: string, cards: string[], rank?: number): Deck {
  return {
    id,
    name,
    format: "standard",
    mode: "bo1",
    rank,
    tier: 1,
    colors: ["G"],
    archetype: name,
    description: "",
    mainboard: cards.map((c) => ({ count: 1, name: c })),
    sideboard: [],
    matchups: [],
    sideboardGuide: [],
    arenaImport: "",
    sources: [],
  };
}

// rotationImpact uses lowercased names in the set — check rotationImpact.ts
describe("buildRotationRoster", () => {
  it("orders decks by cards lost", () => {
    // deckRotationImpact lowercases cardNames from rotation
    const rot: RotationImpact = {
      nextDate: "2026-08-01",
      roughLabel: null,
      setCodes: ["woe"],
      cardNames: ["slickshot show-off", "questing druid", "restless cottage"],
    };
    const decks = [
      deck("a", "Heavy", ["Slickshot Show-Off", "Questing Druid", "Restless Cottage"], 2),
      deck("b", "Light", ["Slickshot Show-Off", "Lightning Bolt"], 1),
      deck("c", "Clean", ["Lightning Bolt"], 3),
    ];
    const rows = buildRotationRoster(decks, rot);
    expect(rows[0].deckId).toBe("a");
    expect(rows[0].cardsLost).toBe(3);
    expect(rows[1].deckId).toBe("b");
    expect(rows.find((r) => r.deckId === "c")).toBeUndefined();
  });
});

describe("buildNearRotationHero", () => {
  it("activates within 45 days", () => {
    const rot: RotationImpact = {
      nextDate: "2026-08-10",
      roughLabel: null,
      setCodes: [],
      cardNames: ["x"],
    };
    const hero = buildNearRotationHero(rot, [], {
      withinDays: 45,
      now: new Date("2026-07-19T12:00:00"),
    });
    expect(hero.active).toBe(true);
    expect(hero.daysUntil).toBe(22);
  });

  it("inactive when far away", () => {
    const rot: RotationImpact = {
      nextDate: "2027-02-01",
      roughLabel: null,
      setCodes: [],
      cardNames: ["x"],
    };
    const hero = buildNearRotationHero(rot, [], {
      now: new Date("2026-07-19T12:00:00"),
    });
    expect(hero.active).toBe(false);
  });

  it("inactive for live-shaped rough-only rotation (nextDate null + Q1 2027)", () => {
    // Mirrors public sets feed shape: nextDate:null, roughLabel, many cardNames.
    const rot: RotationImpact = {
      nextDate: null,
      roughLabel: "Q1 2027",
      setCodes: ["woe", "lci"],
      cardNames: Array.from({ length: 50 }, (_, i) => `card ${i}`),
    };
    const hero = buildNearRotationHero(rot, [], {
      withinDays: 45,
      now: new Date("2026-07-19T12:00:00"),
    });
    expect(hero.active).toBe(false);
    expect(hero.daysUntil).toBeNull();
    expect(hero.roughLabel).toBe("Q1 2027");
    expect(hero.cardCount).toBe(50);
  });
});

describe("arsenalRiskFromNamedLists", () => {
  it("flags personal decks with rotating cards", () => {
    const rot: RotationImpact = {
      nextDate: null,
      roughLabel: "Q1 2027",
      setCodes: [],
      cardNames: ["foo", "bar"],
    };
    const rows = arsenalRiskFromNamedLists(
      [
        { key: "a", name: "A", games: 10, cardNames: ["Foo", "Bolt"] },
        { key: "b", name: "B", games: 3, cardNames: ["Bolt"] },
      ],
      rot,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].deckKey).toBe("a");
    expect(rows[0].cardsAtRisk).toBe(1);
  });
});
