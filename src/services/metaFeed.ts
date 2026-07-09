import type { MetaBundle } from "../types/meta";
import { seedMeta } from "../data/seedMeta";
import { normalizeMetaBundle } from "./deckHelpers";

/** Primary feed URL — override via localStorage `bbi.metaUrl` for testing. */
export const DEFAULT_META_URL = "https://filthy-net-deck.netlify.app/meta/latest.json";

export type MetaFetchSource = "network" | "offline" | "cache";

const LOCAL_SEED_PATH = "/meta/latest.json";

function getMetaUrl(): string {
  try {
    const override = localStorage.getItem("bbi.metaUrl");
    if (override) return override;
  } catch {
    /* ignore */
  }
  // Prefer same-origin / relative when bundled with website or public/
  if (typeof window !== "undefined" && window.location?.protocol === "http:") {
    return LOCAL_SEED_PATH;
  }
  return DEFAULT_META_URL;
}

export async function fetchMetaBundle(): Promise<{
  bundle: MetaBundle;
  from: "network" | "seed" | "cache";
}> {
  // 1) Try network / local public meta
  try {
    const url = getMetaUrl();
    const res = await fetch(url, { cache: "no-cache" });
    if (res.ok) {
      const data = (await res.json()) as MetaBundle;
      if (data?.formats?.length && data?.decks) {
        return { bundle: normalizeMetaBundle(data), from: "network" };
      }
    }
  } catch {
    /* fall through */
  }

  // 2) Try default Netlify if we tried relative first
  try {
    if (getMetaUrl() !== DEFAULT_META_URL) {
      const res = await fetch(DEFAULT_META_URL, { cache: "no-cache" });
      if (res.ok) {
        const data = (await res.json()) as MetaBundle;
        if (data?.formats?.length && data?.decks) {
          return { bundle: normalizeMetaBundle(data), from: "network" };
        }
      }
    }
  } catch {
    /* fall through */
  }

  // 3) Built-in offline pack (always works without network)
  return { bundle: normalizeMetaBundle(seedMeta), from: "seed" };
}
