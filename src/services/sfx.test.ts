import { describe, expect, it } from "vitest";
import {
  isSoundCueSet,
  SFX_EVENTS,
  SOUND_CUE_SETS,
  tonesFor,
  type SfxEvent,
  type SoundCueSet,
} from "./sfx";

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

describe("SOUND_CUE_SETS / SFX_EVENTS", () => {
  it("exposes three packs and five cue types", () => {
    expect(SOUND_CUE_SETS).toHaveLength(3);
    expect(SFX_EVENTS).toHaveLength(5);
    expect(SFX_EVENTS.map((e) => e.id).sort()).toEqual(
      ["draw", "loss", "rankup", "ui", "win"].sort(),
    );
  });
});

describe("tonesFor", () => {
  it("returns short polite envelopes for every pack × cue", () => {
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
        }
      }
    }
  });

  it("gives each pack multiple distinct cue shapes", () => {
    for (const set of SETS) {
      const win = tonesFor(set, "win");
      const loss = tonesFor(set, "loss");
      const ui = tonesFor(set, "ui");
      expect(win.length).toBeGreaterThan(ui.length);
      expect(loss[loss.length - 1].freq).toBeLessThan(loss[0].freq);
      expect(win[win.length - 1].freq).toBeGreaterThan(win[0].freq);
    }
  });

  it("keeps rank-up longer than a soft click", () => {
    const rank = tonesFor("soft", "rankup");
    const ui = tonesFor("soft", "ui");
    const rankSpan = Math.max(...rank.map((t) => t.delay + t.dur));
    const uiSpan = Math.max(...ui.map((t) => t.delay + t.dur));
    expect(rankSpan).toBeGreaterThan(uiSpan);
  });
});
