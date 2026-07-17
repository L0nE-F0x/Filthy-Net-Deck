import { describe, expect, it } from "vitest";
import { backoffMs, canRetry, withRetries, DEFAULT_MAX_RETRIES } from "./retryPolicy";

describe("retryPolicy", () => {
  it("caps exponential backoff", () => {
    expect(backoffMs(0, 1500)).toBe(1500);
    expect(backoffMs(10, 1500, 30_000)).toBe(30_000);
  });

  it("stops at DEFAULT_MAX_RETRIES", () => {
    expect(canRetry(DEFAULT_MAX_RETRIES - 1)).toBe(true);
    expect(canRetry(DEFAULT_MAX_RETRIES)).toBe(false);
  });

  it("retries retryable errors then succeeds", async () => {
    let n = 0;
    const sleeps: number[] = [];
    const result = await withRetries(
      async () => {
        n++;
        if (n < 3) {
          const err = new Error("429 rate limit");
          throw err;
        }
        return "ok";
      },
      {
        maxAttempts: 5,
        sleep: async (ms) => {
          sleeps.push(ms);
        },
      },
    );
    expect(result).toBe("ok");
    expect(n).toBe(3);
    expect(sleeps.length).toBe(2);
  });

  it("gives up after max attempts", async () => {
    await expect(
      withRetries(
        async () => {
          throw new Error("429");
        },
        { maxAttempts: 3, sleep: async () => {} },
      ),
    ).rejects.toThrow(/429/);
  });
});
