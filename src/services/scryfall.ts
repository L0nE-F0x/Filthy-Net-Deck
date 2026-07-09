/** Lightweight Scryfall helpers — rate-limit friendly, cached in memory. */

const cache = new Map<string, string | null>();
const queue: Array<() => void> = [];
let active = 0;
const MAX_CONCURRENT = 2;
const DELAY_MS = 80;

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
      fetch(url, { headers: { Accept: "application/json" } })
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

export function scryfallImageUrl(cardName: string, size: "small" | "normal" | "art_crop" = "normal"): string {
  const encoded = encodeURIComponent(cardName);
  // Named-card image endpoint — no auth, good for UI previews
  if (size === "art_crop") {
    return `https://api.scryfall.com/cards/named?exact=${encoded}&format=image&version=art_crop`;
  }
  return `https://api.scryfall.com/cards/named?exact=${encoded}&format=image&version=${size}`;
}

export async function resolveCardImage(cardName: string): Promise<string | null> {
  if (cache.has(cardName)) return cache.get(cardName) ?? null;
  try {
    const res = await throttledFetch(
      `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}`,
    );
    if (!res.ok) {
      cache.set(cardName, null);
      return null;
    }
    const data = (await res.json()) as {
      image_uris?: { normal?: string; art_crop?: string };
      card_faces?: { image_uris?: { normal?: string; art_crop?: string } }[];
    };
    const uri =
      data.image_uris?.normal ??
      data.card_faces?.[0]?.image_uris?.normal ??
      null;
    cache.set(cardName, uri);
    return uri;
  } catch {
    cache.set(cardName, null);
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
