import type { SetsBundle } from "../types/sets";

const DEFAULT_SETS_URL = "https://filthy-net-deck.netlify.app/meta/sets.json";
const LOCAL_SETS_PATH = "/meta/sets.json";
const CACHE_KEY = "bbi.sets.lastGood";

function getSetsUrl(): string {
  // Relative path only on the Vite dev server — see getMetaUrl in metaFeed.ts:
  // Tauri's Windows production origin is http://tauri.localhost, where a
  // relative fetch would serve the build-time snapshot, not the live feed.
  if (import.meta.env.DEV) return LOCAL_SETS_PATH;
  return DEFAULT_SETS_URL;
}

function isValidBundle(data: unknown): data is SetsBundle {
  const b = data as SetsBundle;
  return Boolean(b?.sets && Array.isArray(b.sets) && b.date);
}

function saveLastGood(bundle: SetsBundle) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(bundle));
  } catch {
    /* ignore */
  }
}

function loadLastGood(): SetsBundle | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as unknown;
    return isValidBundle(data) ? data : null;
  } catch {
    return null;
  }
}

async function tryFetch(url: string): Promise<SetsBundle | null> {
  try {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    return isValidBundle(data) ? data : null;
  } catch {
    return null;
  }
}

/**
 * Fetch published set radar. Network first, then last good cache.
 * Throws only when nothing is available (same philosophy as meta feed).
 */
export async function fetchSetsBundle(): Promise<{
  bundle: SetsBundle;
  from: "network" | "cache";
}> {
  const primary = getSetsUrl();
  let bundle = await tryFetch(primary);
  if (!bundle && primary !== DEFAULT_SETS_URL) {
    bundle = await tryFetch(DEFAULT_SETS_URL);
  }
  if (bundle) {
    saveLastGood(bundle);
    return { bundle, from: "network" };
  }
  const cached = loadLastGood();
  if (cached) return { bundle: cached, from: "cache" };
  throw new Error(
    "Could not download the set radar and no cached copy exists. Check your connection — the app retries when you’re back online.",
  );
}
