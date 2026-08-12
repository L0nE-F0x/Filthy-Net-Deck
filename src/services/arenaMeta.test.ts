// @vitest-environment jsdom
//
// Needs a DOM only for `localStorage` and `window.setTimeout`, which the
// resolver's disk cache uses. The rest of the suite stays in the node
// environment.
/**
 * The gap-map fallback: what happens when Scryfall does not know an Arena id.
 *
 * The bug this covers, in full: on 2026-08-12 every card from The Hobbit showed
 * in the deck list and the overlay as `Card #103529`. Scryfall's own entry for
 * that card said `games: ["paper","mtgo","arena"]` with `arena_id: null`, so
 * `/cards/arena/103529` 404'd and the app had nowhere else to look.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const realFetch = globalThis.fetch;

function res(body: unknown, ok = true): Response {
  return { ok, json: () => Promise.resolve(body) } as unknown as Response;
}

/** Fresh module per test — the resolver caches in module scope by design. */
async function freshModule() {
  vi.resetModules();
  return import("./arenaMeta");
}

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe("resolveArenaMeta — Scryfall knows the card", () => {
  it("returns the full record and does not touch the gap map", async () => {
    const seen: string[] = [];
    globalThis.fetch = vi.fn((u: RequestInfo | URL) => {
      seen.push(String(u));
      return Promise.resolve(
        res({
          id: "abc",
          name: "Lightning Bolt",
          type_line: "Instant",
          mana_cost: "{R}",
          cmc: 1,
          color_identity: ["R"],
        }),
      );
    }) as unknown as typeof fetch;

    const m = await freshModule();
    const meta = await m.resolveArenaMeta(555);
    expect(meta?.name).toBe("Lightning Bolt");
    expect(meta?.partial).toBeUndefined();
    // The gap map costs a network round trip; it must not be fetched on the
    // overwhelmingly common path.
    expect(seen.some((u) => u.includes("arena-names.json"))).toBe(false);
  });
});

describe("resolveArenaMeta — Scryfall 404s", () => {
  it("falls back to the published name, instead of showing Card #id", async () => {
    globalThis.fetch = vi.fn((u: RequestInfo | URL) => {
      const url = String(u);
      if (url.includes("/cards/arena/")) return Promise.resolve(res(null, false));
      if (url.includes("arena-names.json")) {
        return Promise.resolve(
          res({
            "103529": { n: "Bolg's Company", c: 2, i: "BR", m: "{B}{R}" },
            "103538": { n: "The Great Goblin", c: 3, i: "BR" },
          }),
        );
      }
      return Promise.resolve(res(null, false));
    }) as unknown as typeof fetch;

    const m = await freshModule();
    expect((await m.resolveArenaMeta(103529))?.name).toBe("Bolg's Company");
    expect((await m.resolveArenaMeta(103538))?.name).toBe("The Great Goblin");
  });

  it("marks the entry partial and never writes it to disk", async () => {
    // A persisted stub would shadow the real card forever once Scryfall catches
    // up, because resolveArenaMeta short-circuits on any cached hit.
    globalThis.fetch = vi.fn((u: RequestInfo | URL) => {
      const url = String(u);
      if (url.includes("arena-names.json"))
        return Promise.resolve(res({ "103529": { n: "Bolg's Company", c: 2, i: "BR", m: "{B}{R}" } }));
      return Promise.resolve(res(null, false));
    }) as unknown as typeof fetch;

    const m = await freshModule();
    const meta = await m.resolveArenaMeta(103529);
    expect(meta?.partial).toBe(true);

    await vi.waitFor(() => {
      const raw = localStorage.getItem("bbi.arenaMeta.v3");
      expect(raw === null || !raw.includes("103529")).toBe(true);
    });
  });

  it("carries mana value, colours and land-ness through", async () => {
    // Without these the card lands in the "0" column of the mana curve with no
    // pips, which is what the first cut of this fix shipped.
    globalThis.fetch = vi.fn((u: RequestInfo | URL) => {
      const url = String(u);
      if (url.includes("arena-names.json")) {
        return Promise.resolve(
          res({
            "103529": { n: "Bolg's Company", c: 2, i: "BR", m: "{B}{R}" },
            "103565": { n: "Elven Passage", l: 1 },
          }),
        );
      }
      return Promise.resolve(res(null, false));
    }) as unknown as typeof fetch;

    const m = await freshModule();
    expect(await m.resolveArenaMeta(103529)).toMatchObject({
      name: "Bolg's Company",
      cmc: 2,
      colorIdentity: ["B", "R"],
      manaCost: "{B}{R}",
      isLand: false,
    });
    // A land has no mana value; `cmc` must stay null rather than becoming 0.
    expect(await m.resolveArenaMeta(103565)).toMatchObject({
      name: "Elven Passage",
      cmc: null,
      colorIdentity: [],
      isLand: true,
    });
  });

  it("still reads the older name-only shape", async () => {
    // A client can meet a map published before the shape changed.
    globalThis.fetch = vi.fn((u: RequestInfo | URL) => {
      const url = String(u);
      if (url.includes("arena-names.json"))
        return Promise.resolve(res({ "103529": "Bolg's Company" }));
      return Promise.resolve(res(null, false));
    }) as unknown as typeof fetch;

    const m = await freshModule();
    expect(await m.resolveArenaMeta(103529)).toMatchObject({
      name: "Bolg's Company",
      cmc: null,
      colorIdentity: [],
    });
  });

  it("claims nothing it cannot support", async () => {
    // Arena's table gives name, mana value, colours and land-ness. It does not
    // give a Scryfall id, so there is no art and no oracle type line, and those
    // stay empty rather than being reconstructed.
    globalThis.fetch = vi.fn((u: RequestInfo | URL) => {
      const url = String(u);
      if (url.includes("arena-names.json"))
        return Promise.resolve(res({ "103529": { n: "Bolg's Company", c: 2, i: "BR", m: "{B}{R}" } }));
      return Promise.resolve(res(null, false));
    }) as unknown as typeof fetch;

    const m = await freshModule();
    const meta = await m.resolveArenaMeta(103529);
    expect(meta).toMatchObject({
      name: "Bolg's Company",
      scryfallId: "",
      artUrl: null,
      typeLine: "",
    });
  });

  it("treats a missing colour as unknown, not as colourless", async () => {
    // The distinction that stops an unresolved card pushing an archetype guess
    // the way the phantom-Island basic-land bug did. An entry with no `i` must
    // produce an empty identity, which inference reads as no evidence.
    globalThis.fetch = vi.fn((u: RequestInfo | URL) => {
      const url = String(u);
      if (url.includes("arena-names.json"))
        return Promise.resolve(res({ "1": { n: "Unstated" }, "2": { n: "Junk", i: "XZ" } }));
      return Promise.resolve(res(null, false));
    }) as unknown as typeof fetch;

    const m = await freshModule();
    expect((await m.resolveArenaMeta(1))?.colorIdentity).toEqual([]);
    // Unrecognised colour letters are dropped, never passed through.
    expect((await m.resolveArenaMeta(2))?.colorIdentity).toEqual([]);
  });

  it("still returns null when the gap map does not have it either", async () => {
    globalThis.fetch = vi.fn((u: RequestInfo | URL) => {
      const url = String(u);
      if (url.includes("arena-names.json")) return Promise.resolve(res({}));
      return Promise.resolve(res(null, false));
    }) as unknown as typeof fetch;

    const m = await freshModule();
    expect(await m.resolveArenaMeta(999999)).toBeNull();
  });

  it("fetches the gap map once, not once per unresolved card", async () => {
    let gapHits = 0;
    globalThis.fetch = vi.fn((u: RequestInfo | URL) => {
      const url = String(u);
      if (url.includes("arena-names.json")) {
        gapHits++;
        return Promise.resolve(res({ "1": "A", "2": "B", "3": "C" }));
      }
      return Promise.resolve(res(null, false));
    }) as unknown as typeof fetch;

    const m = await freshModule();
    await Promise.all([m.resolveArenaMeta(1), m.resolveArenaMeta(2), m.resolveArenaMeta(3)]);
    expect(gapHits).toBe(1);
  });

  it("survives the gap map being unreachable", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.reject(new Error("offline")),
    ) as unknown as typeof fetch;
    const m = await freshModule();
    await expect(m.resolveArenaMeta(103529)).resolves.toBeNull();
  });
});
