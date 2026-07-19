import { describe, expect, it } from "vitest";
import { isSoundCueSet, SOUND_CUE_SETS, tonesFor, type SfxEvent, type SoundCueSet } from "./sfx";

const SETS: SoundCueSet[] = ["soft", "crystal", "tabletop"];
const EVENTS: SfxEvent[] = ["win", "loss", "draw", "rankup", "ui"];

describe("isSoundCueSet", () => {
  it("accepts known sets only", () => {
    expect(isSoundCueSet("soft")).toBe(true);
    expect(isSoundCueSet("crystal")).toBe(true);
    expect(isSoundCueSet("tabletop")).toBe(true);
    expect(isSoundCueSet("loud")).toBe(false);
    expect(isSoundCueSet(null)).toBe(false);
  });
});

describe("SOUND_CUE_SETS", () => {
  it("exposes three tasteful options", () => {
    expect(SOUND_CUE_SETS).toHaveLength(3);
    expect(SOUND_CUE_SETS.map((s) => s.id).sort()).toEqual(
      ["crystal", "soft", "tabletop"].sort(),
    );
  });
});

describe("tonesFor", () => {
  it("returns short polite envelopes for every set × event", () => {
    for (const set of SETS) {
      for (const event of EVENTS) {
        const tones = tonesFor(set, event);
        expect(tones.length).toBeGreaterThan(0);
        for (const t of tones) {
          expect(t.freq).toBeGreaterThan(40);
          expect(t.freq).toBeLessThan(4000);
          expect(t.dur).toBeGreaterThan(0);
          expect(t.dur).toBeLessThanOrEqual(0.35);
          expect(t.gain).toBeGreaterThan(0);
          expect(t.gain).toBeLessThan(0.2);
          expect(t.delay).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("makes rank-up longer / brighter than ui tick", () => {
    const rank = tonesFor("soft", "rankup");
    const ui = tonesFor("soft", "ui");
    expect(rank.length).toBeGreaterThan(ui.length);
    const rankSpan = Math.max(...rank.map((t) => t.delay + t.dur));
    const uiSpan = Math.max(...ui.map((t) => t.delay + t.dur));
    expect(rankSpan).toBeGreaterThan(uiSpan);
  });

  it("uses an ascending win and descending loss contour", () => {
    const win = tonesFor("soft", "win");
    const loss = tonesFor("soft", "loss");
    expect(win[win.length - 1].freq).toBeGreaterThan(win[0].freq);
    expect(loss[loss.length - 1].freq).toBeLessThan(loss[0].freq);
  });
});
