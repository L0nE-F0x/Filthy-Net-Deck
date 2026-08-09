import type { SetPreviewCard, SetsBundle } from "../types/sets";
import { SITE_ORIGIN, SITE_ORIGINS } from "./site";

const DEFAULT_SETS_URL = `${SITE_ORIGIN}/meta/sets.json`;
const SETS_URLS = SITE_ORIGINS.map((o) => `${o}/meta/sets.json`);
const LOCAL_SETS_PATH = "/meta/sets.json";
const CACHE_KEY = "bbi.sets.lastGood";

/** In-session cache of lazy per-set galleries (code → cards). */
const galleryMem = new Map<string, SetPreviewCard[]>();

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

/**
 * Offline cache should not hold multi‑MB full card galleries for every live
 * set — that alone is ~4MB of localStorage + a second parsed copy on cold
 * boot. Keep full `cards[]` only for sets that are still spoiling (where the
 * in-app gallery is the product); live/released rows fall back to previews
 * offline and the next network refresh restores full galleries.
 */
function slimForCache(bundle: SetsBundle): SetsBundle {
  return {
    ...bundle,
    sets: bundle.sets.map((set) => {
      if (set.status === "spoiling" || set.status === "announced") return set;
      if (!set.cards?.length) return set;
      const { cards: _drop, ...rest } = set;
      // Prefer an existing previews rail; otherwise keep a short sample so
      // offline still has *something* to show on the set card.
      const previews =
        rest.previews?.length ? rest.previews : set.cards.slice(0, 12);
      return { ...rest, previews };
    }),
  };
}

function saveLastGood(bundle: SetsBundle) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(slimForCache(bundle)));
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
  if (!bundle) {
    for (const url of SETS_URLS) {
      if (url === primary) continue;
      bundle = await tryFetch(url);
      if (bundle) break;
    }
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

function galleryUrls(code: string): string[] {
  const safe = String(code || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
  if (!safe) return [];
  if (import.meta.env.DEV) return [`/meta/sets/${safe}.json`];
  return SITE_ORIGINS.map((o) => `${o}/meta/sets/${safe}.json`);
}

async function tryFetchGallery(url: string): Promise<SetPreviewCard[] | null> {
  try {
    const res = await fetch(url, { cache: "default" });
    if (!res.ok) return null;
    const data = (await res.json()) as { cards?: SetPreviewCard[] };
    return Array.isArray(data?.cards) && data.cards.length ? data.cards : null;
  } catch {
    return null;
  }
}

/**
 * Full card gallery for one set — lazy companion to the slim sets index.
 * Live/released Standard-pool sets ship without `cards[]` in sets.json;
 * open the gallery to pull `meta/sets/<code>.json` once per session.
 */
export async function fetchSetGallery(code: string): Promise<SetPreviewCard[] | null> {
  const key = String(code || "").toLowerCase();
  if (!key) return null;
  if (galleryMem.has(key)) return galleryMem.get(key) ?? null;

  for (const url of galleryUrls(key)) {
    const cards = await tryFetchGallery(url);
    if (cards) {
      galleryMem.set(key, cards);
      return cards;
    }
  }
  return null;
}
