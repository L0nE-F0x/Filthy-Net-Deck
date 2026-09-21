import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithTimeout } from "./http";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("fetchWithTimeout", () => {
  it("gives up rather than hanging forever", async () => {
    // A WebKit fetch against a captive portal (or, 2026-09-21, a live
    // WebKitGTK request that never opened a socket) can stay pending
    // indefinitely. Abort must reject it so the splash can fall back to cache.
    globalThis.fetch = vi.fn(
      (_i: RequestInfo | URL, init?: RequestInit) =>
        new Promise((_res, rej) => {
          init?.signal?.addEventListener("abort", () => rej(new Error("aborted")));
        }),
    ) as unknown as typeof fetch;

    vi.useFakeTimers();
    const p = fetchWithTimeout("https://example.test/meta.json", {}, 50);
    const assertion = expect(p).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(200);
    await assertion;
  });

  it("resolves when the request finishes in time", async () => {
    globalThis.fetch = vi.fn(async () => {
      return { ok: true, status: 200 } as Response;
    }) as unknown as typeof fetch;

    const res = await fetchWithTimeout("https://example.test/meta.json", {}, 50);
    expect(res.ok).toBe(true);
  });
});
