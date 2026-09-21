import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MetaBundle } from "../types/meta";
import { fetchMetaBundle, loadCachedMetaBundle } from "./metaFeed";

const realFetch = globalThis.fetch;

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

function validBundle(date = "2026-09-20"): MetaBundle {
  return {
    generatedAt: `${date}T00:00:00Z`,
    date,
    formats: [
      {
        id: "standard",
        name: "Standard",
        featured: true,
        shortLabel: "STD",
        bo1DeckIds: ["d1"],
        bo3DeckIds: ["d1"],
        bo1: { deckId: "d1" },
        bo3: { deckId: "d1" },
        tiers: [],
        metaNotes: "",
        metaShareTop: [],
      },
    ],
    decks: {
      d1: {
        id: "d1",
        name: "Test Deck",
        format: "standard",
        mode: "bo1",
        tier: 1,
        colors: ["R"],
        description: "",
        main: [],
        side: [],
      },
    },
    tournaments: [],
    sources: [],
    version: "1",
  } as unknown as MetaBundle;
}

beforeEach(() => {
  memStorage();
  globalThis.fetch = realFetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("loadCachedMetaBundle", () => {
  it("returns null when nothing has been downloaded yet", () => {
    expect(loadCachedMetaBundle()).toBeNull();
  });

  it("returns the last good copy", () => {
    localStorage.setItem("bbi.meta.lastGood", JSON.stringify(validBundle()));
    const cached = loadCachedMetaBundle();
    expect(cached?.date).toBe("2026-09-20");
    expect(cached?.decks.d1?.name).toBe("Test Deck");
  });
});

describe("fetchMetaBundle", () => {
  it("falls back to cache when every origin hangs", async () => {
    localStorage.setItem("bbi.meta.lastGood", JSON.stringify(validBundle()));
    globalThis.fetch = vi.fn(
      (_i: RequestInfo | URL, init?: RequestInit) =>
        new Promise((_res, rej) => {
          init?.signal?.addEventListener("abort", () => rej(new Error("aborted")));
        }),
    ) as unknown as typeof fetch;

    vi.useFakeTimers();
    const p = fetchMetaBundle();
    // Dev primary + two CDN origins × 8s default timeout, plus slack.
    const assertion = expect(p).resolves.toMatchObject({
      from: "cache",
      bundle: { date: "2026-09-20" },
    });
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
  });

  it("prefers a live download over the cache", async () => {
    localStorage.setItem("bbi.meta.lastGood", JSON.stringify(validBundle("2026-09-20")));
    globalThis.fetch = vi.fn(async () => {
      return {
        ok: true,
        json: async () => validBundle("2026-09-21"),
      } as Response;
    }) as unknown as typeof fetch;

    const result = await fetchMetaBundle();
    expect(result.from).toBe("network");
    expect(result.bundle.date).toBe("2026-09-21");
  });
});
