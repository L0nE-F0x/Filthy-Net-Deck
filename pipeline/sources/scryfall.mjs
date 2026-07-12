/**
 * Scryfall validation — the pipeline's data-integrity gate.
 *
 * Every card name that ships in latest.json must resolve to a real card via
 * POST /cards/collection (batched, 75 identifiers max per request). We store
 * the canonical name + scryfall id on each entry so the client can build
 * exact CDN image URLs and never guess (the old fuzzy lookup rendered the
 * wrong card's art for any invented name).
 */

const API = "https://api.scryfall.com";
const HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json",
  "User-Agent": "FilthyNetDeck/0.8 (+https://github.com/L0nE-F0x/Filthy-Net-Deck)",
};

/** cache: lowercased input name → card object | null */
const cache = new Map();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function keep(card) {
  const typeLine = card.type_line || card.card_faces?.[0]?.type_line || "";
  return {
    name: card.name,
    id: card.id,
    legalities: card.legalities || {},
    games: card.games || [],
    faceName: card.card_faces?.[0]?.name,
    cmc: typeof card.cmc === "number" ? card.cmc : undefined,
    // Front face decides what the card "is" for curve purposes (MDFC lands etc.)
    isLand: /^[^/]*\bLand\b/.test(typeLine.split("//")[0]),
  };
}

async function postCollection(identifiers) {
  const res = await fetch(`${API}/cards/collection`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ identifiers }),
  });
  if (res.status === 429) {
    await sleep(1500);
    return postCollection(identifiers);
  }
  if (!res.ok) throw new Error(`scryfall collection → ${res.status}`);
  return res.json();
}

async function fuzzyLookup(name) {
  try {
    const res = await fetch(
      `${API}/cards/named?fuzzy=${encodeURIComponent(name)}`,
      { headers: HEADERS },
    );
    if (!res.ok) return null;
    return keep(await res.json());
  } catch {
    return null;
  }
}

/**
 * Resolve a batch of names. Returns Map<lowercased input name, card|null>.
 * Unknown names get ONE fuzzy retry (catches punctuation/diacritic drift);
 * if fuzzy lands on a clearly different card we treat the name as unknown —
 * better no card than the wrong card.
 */
export async function resolveCards(names) {
  const wanted = [...new Set(names.map((n) => String(n).trim()).filter(Boolean))];
  const misses = wanted.filter((n) => !cache.has(n.toLowerCase()));

  for (let i = 0; i < misses.length; i += 75) {
    const chunk = misses.slice(i, i + 75);
    const data = await postCollection(chunk.map((name) => ({ name })));
    const found = new Map();
    for (const card of data.data || []) {
      found.set(card.name.toLowerCase(), keep(card));
      // collection echoes back cards matched by face name too — index faces
      for (const face of card.card_faces || []) {
        if (face.name) found.set(face.name.toLowerCase(), keep(card));
      }
    }
    for (const name of chunk) {
      const hit = found.get(name.toLowerCase());
      if (hit) {
        cache.set(name.toLowerCase(), hit);
        continue;
      }
      // exact-batch miss → try direct match among returned, else fuzzy once
      await sleep(120);
      const fz = await fuzzyLookup(name);
      if (fz && namesClose(name, fz)) {
        cache.set(name.toLowerCase(), fz);
      } else {
        cache.set(name.toLowerCase(), null);
      }
    }
    await sleep(120);
  }

  const out = new Map();
  for (const n of wanted) out.set(n.toLowerCase(), cache.get(n.toLowerCase()) ?? null);
  return out;
}

/** Accept a fuzzy hit only when the input closely matches the card or a face. */
function namesClose(input, card) {
  const norm = (s) =>
    String(s)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const i = norm(input);
  const candidates = [card.name, card.faceName].filter(Boolean).map(norm);
  for (const c of candidates) {
    if (c === i) return true;
    if (c.startsWith(i) || i.startsWith(c)) return true;
    // full name "A // B" — accept either half
    for (const half of String(card.name).split("//").map(norm)) {
      if (half === i) return true;
    }
  }
  return false;
}

/** App format id → scryfall legalities key */
const LEGALITY_KEY = {
  standard: "standard",
  alchemy: "alchemy",
  historic: "historic",
  timeless: "timeless",
  pioneer: "pioneer",
  brawl: "brawl",
  historic_brawl: "brawl",
  standard_brawl: "standardbrawl",
};

/**
 * Validate + canonicalize one deck in place.
 *  - rewrites entry names to Scryfall canonical (front-face for DFCs stays full name)
 *  - attaches scryfallId to every resolved entry
 *  - drops entries that don't resolve to a real card
 *  - reports cards illegal in the deck's format (dropped only when `dropIllegal`)
 * Note: legality is the gate, not `games` — /cards/collection returns an
 * arbitrary printing whose games array doesn't reflect Arena availability.
 * Returns { unknown, illegal, mainCount }.
 */
export async function validateDeck(deck, formatId, { dropIllegal = false } = {}) {
  const legKey = LEGALITY_KEY[formatId];
  const all = [
    ...(deck.mainboard || []),
    ...(deck.sideboard || []),
    ...(deck.commander ? [{ name: deck.commander, count: 1 }] : []),
  ];
  let resolved;
  try {
    resolved = await resolveCards(all.map((c) => c.name));
  } catch (e) {
    // No network (true offline build) — leave the deck untouched rather than
    // dropping everything as "unknown".
    console.warn(`  [scryfall] validation skipped (${e.message})`);
    return {
      unknown: [],
      illegal: [],
      mainCount: (deck.mainboard || []).reduce((s, c) => s + c.count, 0),
      skipped: true,
    };
  }

  const unknown = [];
  const illegal = [];

  const fix = (arr) => {
    const out = [];
    for (const entry of arr || []) {
      const card = resolved.get(String(entry.name).trim().toLowerCase());
      if (!card) {
        unknown.push(entry.name);
        continue;
      }
      const status = legKey ? card.legalities[legKey] : "legal";
      const isIllegal = status !== "legal" && status !== "restricted";
      if (isIllegal) illegal.push(card.name);
      if (dropIllegal && isIllegal) continue;
      out.push({
        count: entry.count,
        name: card.name,
        scryfallId: card.id,
        ...(card.cmc != null ? { cmc: card.cmc } : {}),
        ...(card.isLand ? { land: true } : {}),
      });
    }
    return out;
  };

  deck.mainboard = fix(deck.mainboard);
  deck.sideboard = fix(deck.sideboard);
  if (deck.commander) {
    const card = resolved.get(deck.commander.trim().toLowerCase());
    if (card) deck.commander = card.name;
  }

  const mainCount = deck.mainboard.reduce((s, c) => s + c.count, 0);
  return {
    unknown: [...new Set(unknown)],
    illegal: [...new Set(illegal)],
    mainCount,
  };
}
