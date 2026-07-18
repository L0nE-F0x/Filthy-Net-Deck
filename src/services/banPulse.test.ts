import { describe, expect, it } from "vitest";
import {
  banChangeSignature,
  diffBans,
  headlineCards,
  needsBaseline,
  summarizeBanChanges,
  type BanSnap,
} from "./banPulse";
import type { FormatHub } from "../types/sets";

function hub(standard: string[], pioneer: string[] = []): FormatHub {
  return {
    standard: { sets: [], bans: standard.map((name) => ({ name })) },
    pioneer: { sets: [], bans: pioneer.map((name) => ({ name })) },
  };
}

const snap = (standard: string[], pioneer: string[] = []): BanSnap => ({
  standard,
  pioneer,
});

describe("diffBans", () => {
  it("returns nothing when lists match the snapshot", () => {
    expect(diffBans(hub(["Alpha", "Beta"]), snap(["alpha", "beta"]))).toEqual([]);
  });

  it("reports new bans with full card info", () => {
    const changes = diffBans(hub(["Alpha", "Beta", "Gamma"]), snap(["alpha", "beta"]));
    expect(changes).toHaveLength(1);
    expect(changes[0].format).toBe("standard");
    expect(changes[0].added.map((b) => b.name)).toEqual(["Gamma"]);
    expect(changes[0].removed).toEqual([]);
  });

  it("reports unbans", () => {
    const changes = diffBans(hub(["Alpha"]), snap(["alpha", "beta"]));
    expect(changes[0].removed).toEqual(["beta"]);
  });

  it("covers both formats independently", () => {
    const changes = diffBans(
      hub(["Alpha"], ["Pio New"]),
      snap(["alpha"], []),
    );
    expect(changes).toHaveLength(1);
    expect(changes[0].format).toBe("pioneer");
  });

  it("is silent with no snapshot (first run baseline)", () => {
    expect(diffBans(hub(["Alpha"]), null)).toEqual([]);
    expect(needsBaseline(hub(["Alpha"]), null)).toBe(true);
  });

  it("ignores a format missing from the feed (hub hiccup ≠ mass unban)", () => {
    const partial: FormatHub = { standard: { sets: [], bans: [{ name: "Alpha" }] } };
    expect(diffBans(partial, snap(["alpha"], ["pio card"]))).toEqual([]);
  });

  it("handles a null hub (older feeds)", () => {
    expect(diffBans(null, snap(["alpha"]))).toEqual([]);
    expect(needsBaseline(null, null)).toBe(false);
  });
});

describe("signatures + copy", () => {
  it("signature is stable across orderings", () => {
    const a = diffBans(hub(["Alpha", "Gamma", "Beta"]), snap(["alpha"]));
    const b = diffBans(hub(["Beta", "Alpha", "Gamma"]), snap(["alpha"]));
    expect(banChangeSignature(a)).toBe(banChangeSignature(b));
  });

  it("summarize reads naturally", () => {
    const changes = diffBans(
      hub(["Alpha", "New One", "New Two"], ["Pio New"]),
      snap(["alpha", "old gone"], []),
    );
    expect(summarizeBanChanges(changes)).toBe(
      "Standard: 2 banned, 1 unbanned · Pioneer: 1 banned",
    );
  });

  it("headline prefers newly banned cards", () => {
    const changes = diffBans(
      hub(["Alpha", "New One"], []),
      snap(["alpha", "old gone"], []),
    );
    expect(headlineCards(changes)).toEqual(["New One", "old gone"]);
  });
});
