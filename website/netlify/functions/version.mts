/**
 * /version.json — serves the release manifest AND counts the request.
 *
 * WHY THIS EXISTS
 * The app has no telemetry, so there is no way to know how many installs are
 * in the wild. But every running copy already fetches /version.json on launch
 * (and hourly when the local meta copy is >90 min old) — see
 * src/services/versionCheck.ts + src/App.tsx. Those requests are a free,
 * zero-privacy-cost install signal that was simply not being recorded.
 *
 * WHAT IS RECORDED
 * Per-day aggregate counters ONLY:
 *   - total requests, split app vs other (bots/browsers)
 *   - app version distribution (once clients send ?v=, from v2.5.4+)
 *   - coarse platform (windows / macos / other) from the User-Agent
 * No IP address, no identifier, no per-user record, nothing that can be traced
 * back to a person. Counters are additive integers in a daily bucket.
 *
 * WHAT IS DELIBERATELY *NOT* INSTRUMENTED
 * /updater/latest.json stays a plain static file. It drives the signed
 * auto-update; putting a function in that path would risk the update channel
 * itself. This endpoint is safe to instrument because versionCheck.ts is
 * null-safe on every failure path — worst case the soft update banner in
 * Settings doesn't appear.
 *
 * FAILURE POLICY
 * Counting must never break the update check. Every counter call is wrapped
 * and swallowed. If the manifest can't be read we return version 0.0.0, which
 * isNewer() treats as "no update available" — the safe direction to fail.
 */
import type { Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
// Bundled at deploy time from website/version.json — the same file the release
// process writes, so there is still exactly one source of truth. Imported
// rather than read from disk because a function's working directory is not
// guaranteed, and a bad path here would break the update check.
import manifest from "../../version.json";

/** Failing "up to date" is safer than a false update prompt. */
const SAFE_FALLBACK = JSON.stringify({ version: "0.0.0", notes: "" });

/**
 * Blob writes are read-modify-write and therefore racy. Sharding the daily
 * bucket spreads concurrent invocations across keys so the loss window is
 * ~1/SHARDS of what a single key would drop. Counts remain approximate by
 * design — this is a traffic gauge, not an accounting ledger.
 */
const SHARDS = 8;

/** Production webview origin; dev runs on localhost:1420. Exported for tests. */
export function isAppRequest(origin: string | null): boolean {
  if (!origin) return false;
  return origin.includes("tauri.localhost") || origin.includes("localhost:1420");
}

export function platformFrom(ua: string): "windows" | "macos" | "other" {
  if (/Windows NT/i.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "macos";
  return "other";
}

/** Only ever store a version we recognise as a plain semver, never raw input. */
export function safeVersion(raw: string | null): string | null {
  if (!raw) return null;
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(raw) ? raw : null;
}

export interface DayBucket {
  app: number;
  other: number;
  versions: Record<string, number>;
  platforms: Record<string, number>;
}

function emptyBucket(): DayBucket {
  return { app: 0, other: 0, versions: {}, platforms: {} };
}

async function record(req: Request): Promise<void> {
  const ua = req.headers.get("user-agent") ?? "";
  const fromApp = isAppRequest(req.headers.get("origin"));
  const version = safeVersion(new URL(req.url).searchParams.get("v"));

  const day = new Date().toISOString().slice(0, 10);
  const shard = Math.floor(Math.random() * SHARDS);
  const store = getStore("fnd-install-counts");
  const key = `${day}/${shard}`;

  const current = ((await store.get(key, { type: "json" })) as DayBucket | null) ?? emptyBucket();

  if (fromApp) current.app += 1;
  else current.other += 1;

  // Only app traffic carries meaningful version/platform signal.
  if (fromApp) {
    if (version) current.versions[version] = (current.versions[version] ?? 0) + 1;
    const plat = platformFrom(ua);
    current.platforms[plat] = (current.platforms[plat] ?? 0) + 1;
  }

  await store.setJSON(key, current);
}

export default async (req: Request, _context: Context): Promise<Response> => {
  // Count first, but never let it affect the response.
  try {
    await record(req);
  } catch {
    // Swallowed on purpose — see FAILURE POLICY above.
  }

  let body = SAFE_FALLBACK;
  try {
    if (typeof manifest?.version === "string" && manifest.version.length > 0) {
      body = JSON.stringify(manifest);
    }
  } catch {
    // Keep SAFE_FALLBACK.
  }

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // Lets a deploy be verified unambiguously: if this header is absent,
      // the static file is serving and counting is NOT active.
      "X-FND-Manifest": "function",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept",
      // The client already cache-busts with ?t=; keep this short so a release
      // is visible immediately without hammering the function.
      "Cache-Control": "public, max-age=60",
    },
  });
};

/**
 * NOTE: routing is deliberately NOT done with `export const config = { path }`.
 * A static version.json already exists at that path and static assets win over
 * function paths, so precedence would be ambiguous. website/netlify.toml (the
 * config Netlify actually reads — the repo-root one is inert) carries an
 * explicit forced redirect instead, and keeping the static file in place means
 * deleting that one redirect block fully reverts this feature.
 */
