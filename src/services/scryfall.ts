/**
 * Scryfall image helpers.
 *
 * Preferred path: the pipeline embeds a `scryfallId` on every card entry, so
 * we can build the exact CDN URL with zero API calls and zero ambiguity.
 * Fallback path: exact-name lookup only. We deliberately do NOT use the fuzzy
 * endpoint — a fuzzy hit on a bad name renders a *different card's* art,
 * which is worse than showing no image at all.
 */

import { apiFetch } from "./http";

export type ArtSize = "small" | "normal" | "art_crop";

/** Direct CDN URL from a scryfall card id — no API round-trip needed. */
export function scryfallCdnUrl(id: string, size: ArtSize = "normal"): string {
  const version = size === "art_crop" ? "art_crop" : size;
  return `https://cards.scryfall.io/${version}/front/${id[0]}/${id[1]}/${id}.jpg`;
}

const imageCache = new Map<string, string | null>();
const queue: Array<() => void> = [];
let active = 0;
const MAX_CONCURRENT = 3;
const DELAY_MS = 60;

function runQueue() {
  while (active < MAX_CONCURRENT && queue.length) {
    const next = queue.shift();
    if (next) {
      active++;
      next();
    }
  }
}

function throttledFetch(url: string): Promise<Response> {
  return new Promise((resolve, reject) => {
    queue.push(() => {
      apiFetch(url, { headers: { Accept: "application/json" } })
        .then((r) => {
          setTimeout(() => {
            active--;
            runQueue();
          }, DELAY_MS);
          resolve(r);
        })
        .catch((e) => {
          active--;
          runQueue();
          reject(e);
        });
    });
    runQueue();
  });
}

type ScryfallCard = {
  image_uris?: Record<string, string | undefined>;
  card_faces?: { image_uris?: Record<string, string | undefined> }[];
};

function pickUri(data: ScryfallCard, size: ArtSize): string | null {
  const uris =
    data.image_uris ??
    data.card_faces?.[0]?.image_uris ??
    data.card_faces?.[1]?.image_uris;
  if (!uris) return null;
  if (size === "art_crop") return uris.art_crop ?? uris.normal ?? uris.small ?? null;
  if (size === "small") return uris.small ?? uris.normal ?? null;
  return uris.normal ?? uris.large ?? uris.small ?? null;
}

/**
 * Resolve an image URL for a card.
 * With a scryfallId this is synchronous-fast (direct CDN URL).
 * Without one, exact-name lookup; unknown names resolve to null (placeholder).
 */
export async function resolveCardImage(
  cardName: string,
  size: ArtSize = "normal",
  scryfallId?: string,
): Promise<string | null> {
  if (scryfallId) return scryfallCdnUrl(scryfallId, size);

  const key = `${size}::${cardName.trim().toLowerCase()}`;
  if (imageCache.has(key)) return imageCache.get(key) ?? null;

  try {
    const url = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}`;
    const res = await throttledFetch(url);
    if (!res.ok) {
      imageCache.set(key, null);
      return null;
    }
    const data = (await res.json()) as ScryfallCard;
    const uri = pickUri(data, size);
    imageCache.set(key, uri);
    return uri;
  } catch {
    imageCache.set(key, null);
    return null;
  }
}

export function colorPipClass(c: string): string {
  switch (c) {
    case "W":
      return "pip-w";
    case "U":
      return "pip-u";
    case "B":
      return "pip-b";
    case "R":
      return "pip-r";
    case "G":
      return "pip-g";
    default:
      return "pip-c";
  }
}
