import type { MetaBundle } from "../types/meta";
import { normalizeMetaBundle } from "./deckHelpers";
import { SITE_ORIGIN, SITE_ORIGINS } from "./site";

/** Primary feed URL — official custom domain (legacy Netlify host is fallback). */
const DEFAULT_META_URL = `${SITE_ORIGIN}/meta/latest.json`;
const META_URLS = SITE_ORIGINS.map((o) => `${o}/meta/latest.json`);

const LOCAL_META_PATH = "/meta/latest.json";
const CACHE_KEY = "bbi.meta.lastGood";

function getMetaUrl(): string {
  // Relative path only on the Vite dev server. The installed desktop app must
  // always hit the CDN: Tauri serves production from http://tauri.localhost on
  // Windows, where a relative fetch would return the meta snapshot baked into
  // the bundle at build time instead of today's published feed.
  if (import.meta.env.DEV) return LOCAL_META_PATH;
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

/** Fetch a single dated archive (`YYYY-MM-DD.json`) from the CDN (or local in dev). */
export async function fetchDatedMeta(date: string): Promise<MetaBundle | null> {
  const safe = String(date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(safe)) return null;
  if (import.meta.env.DEV) {
    const bundle = await tryFetch(`/meta/${safe}.json?t=${Date.now()}`);
    return bundle ? normalizeMetaBundle(bundle) : null;
  }
  for (const origin of SITE_ORIGINS) {
    const bundle = await tryFetch(`${origin}/meta/${safe}.json?t=${Date.now()}`);
    if (bundle) return normalizeMetaBundle(bundle);
  }
  return null;
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
  if (!bundle) {
    for (const url of META_URLS) {
      if (url === primary) continue;
      bundle = await tryFetch(url);
      if (bundle) break;
    }
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
    "Could not download the meta feed and no previously downloaded copy exists on this machine. Check your connection — the app retries automatically once you’re back online. It never shows placeholder deck data.",
  );
}
