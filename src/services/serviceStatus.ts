/**
 * The "we know, fix incoming" channel (`docs/PLATFORM-STRATEGY.md` §2.7).
 *
 * The app reads Arena's log format, which is unofficial and can change in any
 * client update. When it does, tracking breaks for everyone at once and the
 * app's own health checks cannot tell the user anything useful — from inside,
 * a changed format looks identical to "you have not played a match yet".
 *
 * §2.7 called for three things. Detection shipped in v2.7.5 as the health ping.
 * This is the other two: a public page, and a way to say so *inside the app*,
 * where the affected user actually is.
 *
 * It reads the same `status.json` the website renders, so the page and the
 * in-app banner cannot disagree about whether there is an incident.
 *
 * Deliberately **not** automated off health-ping data. The ping is opt-in and
 * default-off, so the reporting population is small; deriving "all systems
 * operational" from a handful of installs would be exactly the fabricated
 * confidence this project refuses everywhere else. A human flips this file when
 * they know something, and it says nothing when nobody does.
 */

import { SITE_ORIGINS } from "./site";

export type ServiceState = "operational" | "degraded" | "down";

export interface ServiceStatus {
  state: ServiceState;
  headline: string;
  detail: string;
  /** Unix ms, or null when the published timestamp was unusable. */
  updated: number | null;
}

/** Only these two are worth interrupting someone for. */
export function isIncident(s: ServiceStatus | null): s is ServiceStatus {
  return s != null && (s.state === "degraded" || s.state === "down");
}

function coerce(raw: unknown): ServiceStatus | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const state = r.state;
  // Anything unrecognised is treated as "operational" rather than shown raw —
  // a typo in the file must not put unexplained text in front of every user.
  const known: ServiceState =
    state === "degraded" || state === "down" ? state : "operational";
  const at = typeof r.updated === "string" ? Date.parse(r.updated) : NaN;
  return {
    state: known,
    headline: typeof r.headline === "string" ? r.headline.slice(0, 200) : "",
    detail: typeof r.detail === "string" ? r.detail.slice(0, 400) : "",
    updated: Number.isFinite(at) ? at : null,
  };
}

/**
 * Fetch the published status. Returns null on any failure.
 *
 * Null means "we could not check", which is not the same as "everything is
 * fine" — callers must not render an all-clear from it. In practice a null
 * simply shows no banner, which is right: a network problem of our own is not
 * something to interrupt the user about.
 *
 * Times out rather than hanging. A `fetch` against a captive portal can stay
 * pending indefinitely, and nothing on this path is worth a leaked promise.
 */
export async function fetchServiceStatus(
  timeoutMs = 6000,
): Promise<ServiceStatus | null> {
  for (const origin of SITE_ORIGINS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${origin}/status.json`, {
        cache: "no-cache",
        signal: ctrl.signal,
      });
      if (!res.ok) continue;
      const parsed = coerce((await res.json()) as unknown);
      if (parsed) return parsed;
    } catch {
      // Try the legacy origin, then give up quietly.
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}
