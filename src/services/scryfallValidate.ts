/** Validate deck card names against Scryfall (throttled, cached). */

const cache = new Map<string, boolean | "pending">();
const queue: Array<() => void> = [];
let active = 0;
const MAX = 2;
const DELAY = 100;

function runQueue() {
  while (active < MAX && queue.length) {
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
          }, DELAY);
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

export async function cardExistsOnScryfall(name: string): Promise<boolean> {
  const key = name.trim().toLowerCase();
  if (cache.has(key) && cache.get(key) !== "pending") {
    return cache.get(key) === true;
  }
  cache.set(key, "pending");
  try {
    const res = await throttledFetch(
      `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`,
    );
    if (res.ok) {
      cache.set(key, true);
      return true;
    }
    // try fuzzy
    const fuzzy = await throttledFetch(
      `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`,
    );
    const ok = fuzzy.ok;
    cache.set(key, ok);
    return ok;
  } catch {
    cache.set(key, true); // don't alarm offline
    return true;
  }
}

export async function validateDeckNames(
  names: string[],
): Promise<{ unknown: string[]; checked: number }> {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const unknown: string[] = [];
  // Cap checks per session for rate limits
  const toCheck = unique.slice(0, 40);
  await Promise.all(
    toCheck.map(async (name) => {
      const ok = await cardExistsOnScryfall(name);
      if (!ok) unknown.push(name);
    }),
  );
  return { unknown, checked: toCheck.length };
}
