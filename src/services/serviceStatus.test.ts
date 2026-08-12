import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchServiceStatus, isIncident, type ServiceStatus } from "./serviceStatus";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

function mockFetch(impl: (url: string) => Promise<Response> | Response) {
  globalThis.fetch = vi.fn((input: RequestInfo | URL) =>
    Promise.resolve(impl(String(input))),
  ) as unknown as typeof fetch;
}

function json(body: unknown, ok = true): Response {
  return {
    ok,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function line(over: Partial<ServiceStatus> = {}): ServiceStatus {
  return { state: "operational", headline: "", detail: "", updated: null, ...over };
}

describe("isIncident", () => {
  it("is true only for states worth interrupting someone for", () => {
    expect(isIncident(line({ state: "degraded" }))).toBe(true);
    expect(isIncident(line({ state: "down" }))).toBe(true);
    expect(isIncident(line({ state: "operational" }))).toBe(false);
    // Null is "could not check", NOT "all clear" — and must never show a banner.
    expect(isIncident(null)).toBe(false);
  });
});

describe("fetchServiceStatus", () => {
  it("reads a published incident", async () => {
    mockFetch(() =>
      json({
        state: "down",
        headline: "Match tracking is broken.",
        detail: "Arena changed its log format.",
        updated: "2026-08-12T09:30:00Z",
      }),
    );
    const s = await fetchServiceStatus();
    expect(s?.state).toBe("down");
    expect(s?.headline).toBe("Match tracking is broken.");
    expect(s?.updated).toBe(Date.parse("2026-08-12T09:30:00Z"));
    expect(isIncident(s)).toBe(true);
  });

  it("treats an unrecognised state as operational rather than showing it raw", async () => {
    // A typo in the file must not put unexplained text in front of every user.
    mockFetch(() => json({ state: "brokn", headline: "???" }));
    const s = await fetchServiceStatus();
    expect(s?.state).toBe("operational");
    expect(isIncident(s)).toBe(false);
  });

  it("survives a malformed or empty payload", async () => {
    mockFetch(() => json({ updated: "not a date" }));
    const s = await fetchServiceStatus();
    expect(s?.state).toBe("operational");
    expect(s?.updated).toBeNull();
  });

  it("falls back to the legacy origin before giving up", async () => {
    const seen: string[] = [];
    mockFetch((url) => {
      seen.push(url);
      if (url.includes("filthy-net-deck.com")) return json(null, false);
      return json({ state: "degraded", headline: "Slow." });
    });
    const s = await fetchServiceStatus();
    expect(seen.length).toBe(2);
    expect(s?.state).toBe("degraded");
  });

  it("returns null when nothing answers — never a false all-clear", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.reject(new Error("offline")),
    ) as unknown as typeof fetch;
    await expect(fetchServiceStatus()).resolves.toBeNull();
  });

  it("gives up rather than hanging forever", async () => {
    // A fetch against a captive portal can stay pending indefinitely. The
    // AbortController must reject it; a leaked promise here would be the same
    // class of bug that froze the splash.
    globalThis.fetch = vi.fn(
      (_i: RequestInfo | URL, init?: RequestInit) =>
        new Promise((_res, rej) => {
          init?.signal?.addEventListener("abort", () => rej(new Error("aborted")));
        }),
    ) as unknown as typeof fetch;

    vi.useFakeTimers();
    const p = fetchServiceStatus(50);
    await vi.advanceTimersByTimeAsync(200);
    await expect(p).resolves.toBeNull();
    vi.useRealTimers();
  });
});
