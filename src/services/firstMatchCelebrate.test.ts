import { beforeEach, describe, expect, it } from "vitest";
import {
  hasCelebratedFirstMatch,
  markFirstMatchCelebrated,
  shouldCelebrateFirstMatch,
} from "./firstMatchCelebrate";

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

describe("firstMatchCelebrate", () => {
  beforeEach(() => memStorage());

  it("fires only on 0 → 1+ transition once", () => {
    expect(shouldCelebrateFirstMatch(0, 1)).toBe(true);
    markFirstMatchCelebrated();
    expect(hasCelebratedFirstMatch()).toBe(true);
    expect(shouldCelebrateFirstMatch(0, 1)).toBe(false);
    expect(shouldCelebrateFirstMatch(1, 2)).toBe(false);
  });
});
