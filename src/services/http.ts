/**
 * Fetch for third-party APIs (Scryfall) and our own CDN (meta / sets).
 *
 * In the desktop app, requests go through the Tauri HTTP plugin (reqwest):
 * that's the only way our descriptive User-Agent actually reaches Scryfall —
 * browser fetch silently drops the UA header as forbidden. It is also the
 * path that cannot stall the splash: WebKitGTK `fetch` has been observed to
 * stay pending with no socket while the same URL answers curl in milliseconds.
 * In the browser (dev / website) we fall back to plain fetch and the header
 * is ignored. Allowed hosts are pinned in src-tauri/capabilities/default.json.
 */
import { isTauri } from "./appUpdater";
import { APP_VERSION } from "../version";
import { SITE_ORIGIN } from "./site";

export const API_USER_AGENT = `FilthyNetDeck/${APP_VERSION} (${SITE_ORIGIN}; local companion)`;

/** Default budget for a single CDN/API attempt. Splash boot races this. */
export const DEFAULT_FETCH_TIMEOUT_MS = 8000;

let tauriFetch: typeof fetch | null = null;

export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const withUa: RequestInit = {
    ...init,
    headers: { ...(init?.headers as Record<string, string>), "User-Agent": API_USER_AGENT },
  };
  if (isTauri()) {
    try {
      if (!tauriFetch) {
        const mod = await import("@tauri-apps/plugin-http");
        tauriFetch = mod.fetch;
      }
      return await tauriFetch(url, withUa);
    } catch {
      // Plugin unavailable — plain fetch still works, minus the UA header.
    }
  }
  return fetch(url, withUa);
}

/**
 * `apiFetch` that cannot stay pending forever. A captive portal or a stuck
 * WebKit request used to freeze the splash for the life of the process —
 * the same class of bug `fetchServiceStatus` already guards against.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await apiFetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}
