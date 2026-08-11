/**
 * Regression: a mis-resolved land must not invent a colour.
 *
 * Reproduced from a real match on 2026-08-11. The opponent was Rakdos — every
 * spell they cast was black or red — but the overlay called them
 * "Grixis Control". Replaying the owner's Player.log and resolving the 24
 * revealed grpIds showed why: one object that Arena itself described as
 *
 *     "grpId": 87457, "cardTypes": ["CardType_Land"],
 *     "superTypes": ["SuperType_Basic"], "subtypes": ["SubType_Swamp"]
 *
 * resolves through the card API to **Island**. Basic-land grpIds are not stable
 * identities the way spell ids are. That phantom Island put U into the
 * *required* colour set, and {B,R} became {U,B,R}.
 *
 * The fix is not to special-case basics: it is that a land's identity is never
 * proof. Lands get copied, transformed and gain types mid-game, and their ids
 * resolve least reliably. Colour proof comes from mana a spell actually cost.
 *
 * This matters beyond the overlay label — inference now keys `opp_archetype` on
 * uploaded matches, so a phantom colour writes a wrong cell into everyone's
 * shared matchup data.
 */
import { describe, expect, it } from "vitest";
import { observedColorsFromSeenCards } from "./opponentArchetype";
import type { SeenCardInfo } from "./opponentArchetype";

const swampMisreadAsIsland: SeenCardInfo = {
  name: "Island",
  typeLine: "Basic Land — Island",
  colorIdentity: ["U"],
  isLand: true,
};

const duress: SeenCardInfo = {
  name: "Duress",
  typeLine: "Sorcery",
  manaCost: "{B}",
  colorIdentity: ["B"],
};

const burstLightning: SeenCardInfo = {
  name: "Burst Lightning",
  typeLine: "Instant",
  manaCost: "{R}",
  colorIdentity: ["R"],
};

const hybridLesson: SeenCardInfo = {
  name: "Abandon Attachments",
  typeLine: "Instant — Lesson",
  manaCost: "{1}{U/R}",
  colorIdentity: ["R", "U"],
};

describe("colour evidence from lands", () => {
  it("does not let a single land prove a colour", () => {
    const ev = observedColorsFromSeenCards([swampMisreadAsIsland]);
    expect([...ev.required]).toEqual([]);
    expect([...ev.soft]).toContain("U");
  });

  it("the real case: Rakdos spells + one phantom Island stays B/R", () => {
    const ev = observedColorsFromSeenCards([
      duress,
      burstLightning,
      swampMisreadAsIsland,
      hybridLesson,
    ]);
    // Proof comes from the spells that were actually cast.
    expect([...ev.required].sort()).toEqual(["B", "R"]);
    // Blue is only ever a hint here — never enough to name the deck Grixis.
    expect(ev.required.has("U")).toBe(false);
  });

  it("still proves colours from real mana costs", () => {
    const ev = observedColorsFromSeenCards([duress, burstLightning]);
    expect([...ev.required].sort()).toEqual(["B", "R"]);
  });

  it("keeps hybrid pips soft, since they are payable another way", () => {
    const ev = observedColorsFromSeenCards([hybridLesson]);
    expect(ev.required.has("U")).toBe(false);
    expect(ev.required.has("R")).toBe(false);
    expect(ev.soft.has("U")).toBe(true);
  });

  it("a correctly-resolved land is still a hint, just not proof", () => {
    const swamp: SeenCardInfo = {
      name: "Swamp",
      typeLine: "Basic Land — Swamp",
      colorIdentity: ["B"],
      isLand: true,
    };
    const ev = observedColorsFromSeenCards([swamp]);
    expect(ev.required.has("B")).toBe(false);
    expect(ev.soft.has("B")).toBe(true);
  });
});
