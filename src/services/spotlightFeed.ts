/**
 * Fetch `spotlight.json`. Dev reads the Vite public file. The installed app
 * reads the site, same hosts as the meta feed. The PC does not scrape magic.gg.
 */
import { fetchWithTimeout } from "./http";
import { SITE_ORIGINS } from "./site";
import { parseSpotlightFeed, type SpotlightFeed } from "./spotlight";

const CACHE_KEY = "bbi.spotlight.last";

export interface SpotlightState {
  feed: SpotlightFeed | null;
  status: "loading" | "ready" | "error";
}

let state: SpotlightState = { feed: null, status: "loading" };
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;
let started = false;

function readCache(): SpotlightFeed | null {
  try {
    const store = globalThis.localStorage;
    if (!store || typeof store.getItem !== "function") return null;
    const raw = store.getItem(CACHE_KEY);
    if (!raw) return null;
    return parseSpotlightFeed(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function writeCache(feed: SpotlightFeed) {
  try {
    const store = globalThis.localStorage;
    if (!store || typeof store.setItem !== "function") return;
    store.setItem(CACHE_KEY, JSON.stringify(feed));
  } catch {
    /* quota — the next launch refetches */
  }
}

function emit(next: SpotlightState) {
  state = next;
  for (const listener of listeners) listener();
}

export function getSpotlightState(): SpotlightState {
  return state;
}

export function subscribeSpotlight(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function feedUrls(): string[] {
  const stamp = Date.now();
  if (import.meta.env.DEV) return [`/spotlight.json?t=${stamp}`];
  return SITE_ORIGINS.map((origin) => `${origin}/spotlight.json?t=${stamp}`);
}

async function pull(): Promise<void> {
  for (const url of feedUrls()) {
    try {
      const res = await fetchWithTimeout(url, { cache: "no-cache" });
      if (!res.ok) continue;
      const parsed = parseSpotlightFeed((await res.json()) as unknown);
      if (!parsed) continue;
      writeCache(parsed);
      emit({ feed: parsed, status: "ready" });
      return;
    } catch {
      /* try the next host */
    }
  }
  emit({ feed: state.feed, status: state.feed ? "ready" : "error" });
}

export function refreshSpotlight(): Promise<void> {
  if (inflight) return inflight;
  inflight = pull().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Poll on launch, focus, reconnect, and every 5 minutes. Idempotent. */
export function startSpotlightSync(): () => void {
  if (started) return () => {};
  started = true;
  const cached = readCache();
  if (cached) emit({ feed: cached, status: "loading" });
  void refreshSpotlight();
  const onWake = () => {
    void refreshSpotlight();
  };
  window.addEventListener("focus", onWake);
  window.addEventListener("online", onWake);
  const timer = window.setInterval(onWake, 5 * 60 * 1000);
  return () => {
    started = false;
    window.removeEventListener("focus", onWake);
    window.removeEventListener("online", onWake);
    window.clearInterval(timer);
  };
}
