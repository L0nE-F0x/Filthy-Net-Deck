/**
 * Shared 429 / rate-limit retry policy (mirrors pipeline caps).
 * Pure helpers so tests and Node pipeline stay aligned.
 */

export interface RetryState {
  attempts: number;
  maxAttempts: number;
}

export const DEFAULT_MAX_RETRIES = 8;

/** Next sleep ms for attempt index (0-based), exponential with cap. */
export function backoffMs(attempt: number, baseMs = 1500, capMs = 30_000): number {
  const exp = Math.min(capMs, baseMs * 2 ** Math.max(0, attempt));
  return Math.floor(exp);
}

/** True while another retry is allowed after this failed attempt. */
export function canRetry(attemptsSoFar: number, maxAttempts = DEFAULT_MAX_RETRIES): boolean {
  return attemptsSoFar < maxAttempts;
}

/**
 * Run `fn` until it succeeds or retries are exhausted.
 * `fn` should throw or return a sentinel; here we use thrown errors only.
 */
export async function withRetries<T>(
  fn: (attempt: number) => Promise<T>,
  opts?: {
    maxAttempts?: number;
    baseMs?: number;
    capMs?: number;
    sleep?: (ms: number) => Promise<void>;
    isRetryable?: (err: unknown) => boolean;
  },
): Promise<T> {
  const maxAttempts = opts?.maxAttempts ?? DEFAULT_MAX_RETRIES;
  const sleep =
    opts?.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const isRetryable =
    opts?.isRetryable ??
    ((err: unknown) => {
      if (err && typeof err === "object" && "status" in err) {
        return (err as { status: number }).status === 429;
      }
      const msg = err instanceof Error ? err.message : String(err);
      return /\b429\b|rate.?limit/i.test(msg);
    });

  let last: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      last = e;
      if (!isRetryable(e) || !canRetry(attempt + 1, maxAttempts)) throw e;
      await sleep(backoffMs(attempt, opts?.baseMs, opts?.capMs));
    }
  }
  throw last;
}
