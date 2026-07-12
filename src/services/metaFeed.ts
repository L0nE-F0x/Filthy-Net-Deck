import type { MetaBundle } from "../types/meta";
import { normalizeMetaBundle } from "./deckHelpers";

/** Primary feed URL — override via localStorage `bbi.metaUrl` for testing. */
export const DEFAULT_META_URL = "https://filthy-net-deck.netlify.app/meta/latest.json";

const LOCAL_META_PATH = "/meta/latest.json";
const CACHE_KEY = "bbi.meta.lastGood";

function getMetaUrl(): string {
  try {
    const override = localStorage.getItem("bbi.metaUrl");
    if (override) return override;
  } catch {
    /* ignore */
  }
  // Prefer same-origin / relative when bundled with website or public/
  if (typeof window !== "undefined" && window.location?.protocol === "http:") {
    return LOCAL_META_PATH;
  }
  return DEFAULT_META_URL;
}

function isValidBundle(data: unknown): data is MetaBundle {
  const b = data as MetaBundle;
  return Boolean(b?.formats?.length && b?.decks && Object.keys(b.decks).length);
}

function saveLastGood(bundle: MetaBundle) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(bundle));
  } catch {
    /* quota — fine, cache is best-effort */
  }
}

function loadLastGood(): MetaBundle | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as unknown;
    return isValidBundle(data) ? data : null;
  } catch {
    return null;
  }
}

async function tryFetch(url: string): Promise<MetaBundle | null> {
  try {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    return isValidBundle(data) ? (data as MetaBundle) : null;
  } catch {
    return null;
  }
}

/**
 * Fetch the published meta. Order: configured/local URL → Netlify CDN →
 * last good downloaded copy (cached on this machine).
 *
 * There is deliberately NO built-in seed pack: this app never shows
 * fabricated lists. With no network and no cached copy, this throws and the
 * UI shows an explicit error state instead.
 */
export async function fetchMetaBundle(): Promise<{
  bundle: MetaBundle;
  from: "network" | "cache";
}> {
  const primary = getMetaUrl();
  let bundle = await tryFetch(primary);
  if (!bundle && primary !== DEFAULT_META_URL) {
    bundle = await tryFetch(DEFAULT_META_URL);
  }
  if (bundle) {
    saveLastGood(bundle);
    return { bundle: normalizeMetaBundle(bundle), from: "network" };
  }

  const cached = loadLastGood();
  if (cached) {
    return { bundle: normalizeMetaBundle(cached), from: "cache" };
  }

  throw new Error(
    "Could not download the meta feed and no previously downloaded copy exists on this machine. Check your connection and hit Refresh — this app never shows placeholder deck data.",
  );
}
