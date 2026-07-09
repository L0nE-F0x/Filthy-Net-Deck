/** Scryfall helpers — resolve real CDN image URLs (img tags that hit /format=image often fail in Tauri WebView). */

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
      fetch(url, {
        headers: {
          Accept: "application/json",
          // Scryfall asks for a descriptive UA on bulk use
        },
      })
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
  image_uris?: {
    small?: string;
    normal?: string;
    large?: string;
    art_crop?: string;
    border_crop?: string;
  };
  card_faces?: {
    image_uris?: {
      small?: string;
      normal?: string;
      large?: string;
      art_crop?: string;
    };
  }[];
};

function pickUri(
  data: ScryfallCard,
  size: "small" | "normal" | "art_crop",
): string | null {
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
 * Resolve a stable https://cards.scryfall.io/... URL for a card name.
 * Tries exact then fuzzy. Caches misses as null.
 */
export async function resolveCardImage(
  cardName: string,
  size: "small" | "normal" | "art_crop" = "normal",
): Promise<string | null> {
  const key = `${size}::${cardName.trim().toLowerCase()}`;
  if (imageCache.has(key)) return imageCache.get(key) ?? null;

  const tryNamed = async (mode: "exact" | "fuzzy") => {
    const url = `https://api.scryfall.com/cards/named?${mode}=${encodeURIComponent(cardName)}`;
    const res = await throttledFetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as ScryfallCard;
    return pickUri(data, size);
  };

  try {
    let uri = await tryNamed("exact");
    if (!uri) uri = await tryNamed("fuzzy");
    imageCache.set(key, uri);
    return uri;
  } catch {
    imageCache.set(key, null);
    return null;
  }
}

/** @deprecated Prefer resolveCardImage — direct format=image URLs break in some WebViews */
export function scryfallImageUrl(
  cardName: string,
  size: "small" | "normal" | "art_crop" = "normal",
): string {
  const encoded = encodeURIComponent(cardName);
  const version = size === "art_crop" ? "art_crop" : size;
  // fuzzy is more forgiving for list previews
  return `https://api.scryfall.com/cards/named?fuzzy=${encoded}&format=image&version=${version}`;
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
