import { beforeEach, describe, expect, it } from "vitest";
import {
  markMetaMoverNotifyFired,
  metaMoverSignature,
  shouldFireMetaMoverNotify,
  summarizeMetaMovers,
} from "./metaMoverHabit";
import type { MetaChange } from "./metaDiff";

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

const changes: MetaChange[] = [
  {
    formatId: "standard",
    formatName: "Standard",
    mode: "bo3",
    rose: ["Izzet Prowess"],
    fell: [],
    entered: [],
    left: [],
  },
  {
    formatId: "pioneer",
    formatName: "Pioneer",
    mode: "bo1",
    rose: [],
    fell: [],
    entered: ["Rakdos Sac"],
    left: [],
  },
];

describe("metaMoverHabit", () => {
  beforeEach(() => memStorage());

  it("summarizes movers", () => {
    const s = summarizeMetaMovers(changes);
    expect(s).toContain("Izzet Prowess");
    expect(s).toContain("Rakdos Sac");
  });

  it("returns null when no rose/entered", () => {
    expect(
      summarizeMetaMovers([
        {
          formatId: "standard",
          formatName: "Standard",
          mode: "bo1",
          rose: [],
          fell: ["X"],
          entered: [],
          left: [],
        },
      ]),
    ).toBeNull();
  });

  it("fires once per signature", () => {
    const sig = metaMoverSignature("2026-07-20", changes);
    expect(shouldFireMetaMoverNotify(sig)).toBe(true);
    markMetaMoverNotifyFired(sig);
    expect(shouldFireMetaMoverNotify(sig)).toBe(false);
  });
});
