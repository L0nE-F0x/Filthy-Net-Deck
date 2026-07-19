/**
 * Fetch for third-party APIs (Scryfall).
 *
 * In the desktop app, requests go through the Tauri HTTP plugin (reqwest):
 * that's the only way our descriptive User-Agent actually reaches Scryfall —
 * browser fetch silently drops the UA header as forbidden. In the browser
 * (dev / website) we fall back to plain fetch and the header is ignored.
 * Allowed hosts are pinned in src-tauri/capabilities/default.json.
 */
import { isTauri } from "./appUpdater";
import { APP_VERSION } from "../version";
import { SITE_ORIGIN } from "./site";

export const API_USER_AGENT = `FilthyNetDeck/${APP_VERSION} (${SITE_ORIGIN}; local companion)`;

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
