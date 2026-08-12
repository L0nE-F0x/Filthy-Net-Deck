// @vitest-environment jsdom
//
// Needs a DOM only for `localStorage`, which the resolver's cache uses.
/**
 * The gap-map fallback on the *other* resolver.
 *
 * v3.0.1/v3.0.2 fixed "every Hobbit card shows as `Card #103529`" in
 * `arenaMeta` — the overlay's resolver. My Stats' deck list, Brew Lab and deck
 * share go through `arenaCards` instead, which knew nothing about the gap map,
 * so those screens still showed `Card #103482` with the fix shipped, the map
 * published, and both names sitting in it. Every test here fails against that.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const realFetch = globalThis.fetch;
const CACHE_KEY = "bbi.arenaCards.v3";

function res(body: unknown, status = 200): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as unknown as Response;
}

/** Fresh modules per test — both the cache and the gap map are module scope. */
async function freshModule() {
  vi.resetModules();
  return import("./arenaCards");
}

/** Scryfall 404s everything; the gap map answers with The Hobbit. */
function stubGap(map: Record<string, unknown>) {
  const hits = { gap: 0, scryfall: 0 };
  globalThis.fetch = vi.fn((u: RequestInfo | URL) => {
    const url = String(u);
    if (url.includes("arena-names.json")) {
      hits.gap++;
      return Promise.resolve(res(map));
    }
    hits.scryfall++;
    return Promise.resolve(res({ status: 404 }, 404));
  }) as unknown as typeof fetch;
  return hits;
}

const HOBBIT = {
  "103482": {
    n: "The Misty Mountains Cold",
    c: 3,
    i: "R",
    m: "{2}{R}",
    s: "3d5f35ff-4146-4844-9da5-031461cc8c05",
    t: "Enchantment — Saga",
  },
  "103489": {
    n: "Smaug the Magnificent",
    c: 4,
    i: "R",
    m: "{2}{R}{R}",
    s: "6a5d8fad-2ffd-4645-8c49-907999b6cecf",
    t: "Legendary Creature — Dragon",
  },
  "103565": { n: "Elven Passage", l: 1 },
};

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe("resolveArenaCards — Scryfall cannot resolve the id", () => {
  it("names the card from the gap map instead of leaving it unresolved", async () => {
    stubGap(HOBBIT);
    const m = await freshModule();
    const map = await m.resolveArenaCards([103482, 103489], { full: true });
    expect(map[103482]?.name).toBe("The Misty Mountains Cold");
    expect(map[103489]?.name).toBe("Smaug the Magnificent");
  });

  it("carries mana cost, mana value and land-ness through", async () => {
    // Without these the card sits in the "0" column of the curve with no pips.
    stubGap(HOBBIT);
    const m = await freshModule();
    const map = await m.resolveArenaCards([103482, 103565], { full: true });
    expect(map[103482]).toMatchObject({ manaCost: "{2}{R}", cmc: 3, isLand: false });
    // A land has no mana value; it must stay absent rather than become 0.
    expect(map[103565]).toMatchObject({ name: "Elven Passage", isLand: true });
    expect(map[103565]?.cmc).toBeUndefined();
  });

  it("carries Scryfall's art id and type line when the map published them", async () => {
    // The owner's 3.0.3 report: names arrived, art did not, and every card
    // landed in "Other". Scryfall HAS these cards — only the arena_id link is
    // missing — so the builder now publishes the id and type line it already
    // had in hand, and the row renders like any other card.
    stubGap(HOBBIT);
    const m = await freshModule();
    const map = await m.resolveArenaCards([103482], { full: true });
    expect(map[103482]?.scryfallId).toBe("3d5f35ff-4146-4844-9da5-031461cc8c05");
    expect(map[103482]?.typeLine).toBe("Enchantment — Saga");
    expect(map[103482]?.partial).toBe(true);
  });

  it("still claims nothing when the map has no Scryfall record", async () => {
    // Tokens never join (they live in their own set), so absent must stay
    // absent rather than becoming an empty string that renders a broken image.
    stubGap(HOBBIT);
    const m = await freshModule();
    const map = await m.resolveArenaCards([103565], { full: true });
    expect(map[103565]?.name).toBe("Elven Passage");
    expect(map[103565]?.scryfallId).toBeUndefined();
    expect(map[103565]?.typeLine).toBeUndefined();
    expect(map[103565]?.partial).toBe(true);
  });

  it("never writes a gap entry to the disk cache", async () => {
    // A persisted stub would shadow the real card forever once Scryfall assigns
    // the arena_id, because a cached hit is never re-fetched.
    stubGap(HOBBIT);
    const m = await freshModule();
    await m.resolveArenaCards([103482], { full: true });
    expect(localStorage.getItem(CACHE_KEY) ?? "").not.toContain("103482");
  });

  it("still answers on a later call, when the id is already known-404", async () => {
    // The second call skips Scryfall via the `notFound` set — the gap lookup has
    // to key off "not in the cache", not off "just 404'd".
    const hits = stubGap(HOBBIT);
    const m = await freshModule();
    await m.resolveArenaCards([103482], { full: true });
    const before = hits.scryfall;
    const map = await m.resolveArenaCards([103482], { full: true });
    expect(map[103482]?.name).toBe("The Misty Mountains Cold");
    expect(hits.scryfall).toBe(before);
  });

  it("leaves the id absent when the gap map does not have it either", async () => {
    stubGap({});
    const m = await freshModule();
    const map = await m.resolveArenaCards([999999], { full: true });
    expect(map[999999]).toBeUndefined();
  });

  it("survives the gap map being unreachable", async () => {
    globalThis.fetch = vi.fn((u: RequestInfo | URL) =>
      String(u).includes("arena-names.json")
        ? Promise.reject(new Error("offline"))
        : Promise.resolve(res({ status: 404 }, 404)),
    ) as unknown as typeof fetch;
    const m = await freshModule();
    await expect(m.resolveArenaCards([103482], { full: true })).resolves.toEqual({});
  });
});

describe("resolveArenaCards — Scryfall knows the card", () => {
  it("uses the real record and does not fetch the gap map at all", async () => {
    let gapHits = 0;
    globalThis.fetch = vi.fn((u: RequestInfo | URL) => {
      if (String(u).includes("arena-names.json")) {
        gapHits++;
        return Promise.resolve(res({}));
      }
      return Promise.resolve(
        res({ id: "abc", name: "Lightning Bolt", type_line: "Instant", mana_cost: "{R}", cmc: 1 }),
      );
    }) as unknown as typeof fetch;

    const m = await freshModule();
    const map = await m.resolveArenaCards([555], { full: true });
    expect(map[555]).toMatchObject({ name: "Lightning Bolt", scryfallId: "abc" });
    expect(map[555].partial).toBeUndefined();
    // The gap map costs a round trip; it must stay off the common path.
    expect(gapHits).toBe(0);
  });
});
