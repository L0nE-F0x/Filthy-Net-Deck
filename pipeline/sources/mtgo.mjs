/**
 * MTGO official decklists
 * Index: https://www.mtgo.com/decklists
 * Event: https://www.mtgo.com/decklist/standard-challenge-32-2026-07-0912847094
 *
 * Full deck data is embedded in the page as:
 *   window.MTGO.decklists.data = { decklists: [ { player, main_deck: [...] } ] }
 */
import { getText, sleep } from "./common.mjs";
import { guessArchetype, inferColorsFromCards } from "./archetypeGuess.mjs";

function mapMtgoFormat(slugOrFormat = "") {
  const s = String(slugOrFormat).toLowerCase();
  if (/alchemy|calchemy/.test(s)) return "alchemy";
  if (/historic|chistoric/.test(s)) return "historic";
  if (/pioneer|explorer|cpioneer/.test(s)) return "pioneer";
  if (/timeless|modern|legacy|vintage|cmodern|clegacy|cvintage/.test(s))
    return "timeless";
  if (/pauper/.test(s)) return "standard"; // no pauper format slot — skip later
  return "standard";
}

/** Prefer competitive constructed events over daily leagues */
function eventPriority(slug = "") {
  const s = slug.toLowerCase();
  if (/limited|sealed|draft|cube/.test(s)) return 0;
  if (/showcase|championship/.test(s)) return 100;
  if (/challenge-64|challenge-32|challenge\b/.test(s)) return 95;
  if (/super-qualifier|qualifier/.test(s) && !/limited/.test(s)) return 85;
  if (/preliminary|prelim/.test(s)) return 60;
  if (/league/.test(s)) return 20;
  return 40;
}

export async function fetchMtgoIndex() {
  const urls = [
    "https://www.mtgo.com/decklists",
    "https://www.mtgo.com/en/mtgo/decklists",
  ];
  for (const url of urls) {
    try {
      const html = await getText(url);
      const links = [];
      const re = /href="(\/decklist\/[a-z0-9-]+)"/gi;
      let m;
      const seen = new Set();
      while ((m = re.exec(html)) !== null) {
        if (seen.has(m[1])) continue;
        seen.add(m[1]);
        const path = m[1];
        const slug = path.replace("/decklist/", "");
        // Skip formats we don't map onto the Arena 8-format grid
        if (/^pauper|limited|sealed|draft|cube|momir|commander|edh/i.test(slug))
          continue;
        links.push({
          path,
          url: `https://www.mtgo.com${path}`,
          slug,
          format: mapMtgoFormat(slug),
          name: slug.replace(/-/g, " "),
          priority: eventPriority(slug),
        });
      }
      if (links.length) {
        links.sort((a, b) => b.priority - a.priority);
        return links;
      }
    } catch (e) {
      console.warn("[mtgo] index", url, e.message);
    }
  }
  // Known recent challenges as discovery seeds
  return [
    {
      url: "https://www.mtgo.com/decklist/standard-challenge-32-2026-07-0912847094",
      slug: "standard-challenge-32-2026-07-0912847094",
      format: "standard",
      name: "Standard Challenge 32 2026-07-09",
      priority: 90,
    },
    {
      url: "https://www.mtgo.com/decklist/standard-challenge-32-2026-07-0712846527",
      slug: "standard-challenge-32-2026-07-0712846527",
      format: "standard",
      name: "Standard Challenge 32 2026-07-07",
      priority: 90,
    },
  ];
}

/**
 * Parse window.MTGO.decklists.data JSON blob from event HTML.
 */
export function parseMtgoDecklistsData(html) {
  const marker = "window.MTGO.decklists.data";
  const idx = html.indexOf(marker);
  if (idx < 0) return null;
  const eq = html.indexOf("=", idx + marker.length);
  if (eq < 0) return null;
  const start = html.indexOf("{", eq);
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const raw = html.slice(start, i + 1);
        try {
          return JSON.parse(raw);
        } catch (e) {
          console.warn("[mtgo] JSON parse failed", e.message);
          return null;
        }
      }
    }
  }
  return null;
}

function cardsFromMainDeck(mainDeck = []) {
  const mainboard = [];
  const sideboard = [];
  const mainMap = new Map();
  const sideMap = new Map();

  for (const c of mainDeck) {
    const name = c?.card_attributes?.card_name || c?.card_name || c?.name;
    if (!name) continue;
    const qty = parseInt(c.qty ?? c.quantity ?? 1, 10) || 1;
    const isSb =
      c.sideboard === true ||
      c.sideboard === "true" ||
      c.sideboard === 1 ||
      c.sideboard === "1";
    const map = isSb ? sideMap : mainMap;
    map.set(name, (map.get(name) || 0) + qty);
  }

  for (const [name, count] of mainMap) mainboard.push({ count, name });
  for (const [name, count] of sideMap) sideboard.push({ count, name });
  const mainCount = mainboard.reduce((s, c) => s + c.count, 0);
  return { mainboard, sideboard, mainCount };
}

/**
 * Fetch one MTGO event and return structured decks from embedded JSON.
 */
export async function fetchMtgoEventDecks(eventUrl, format = "standard") {
  try {
    const html = await getText(eventUrl);
    const data = parseMtgoDecklistsData(html);
    if (!data?.decklists?.length) {
      console.warn("[mtgo] no embedded decklists JSON for", eventUrl);
      return [];
    }

    const eventName = data.description || data.site_name || "MTGO event";
    const decks = [];

    for (const d of data.decklists) {
      const parsed = cardsFromMainDeck(d.main_deck || d.mainboard || []);
      if (parsed.mainCount < 50 || parsed.mainCount > 110) continue;
      const colors = inferColorsFromCards(parsed.mainboard);
      const name =
        d.archetype ||
        d.deck_name ||
        guessArchetype(parsed.mainboard) ||
        undefined;
      decks.push({
        ...parsed,
        name,
        colors,
        player: d.player || d.loginid || undefined,
        source: "mtgo",
        sourceLabel: "MTGO official",
        url: eventUrl,
        note: `MTGO ${eventName}${d.player ? ` · ${d.player}` : ""}${name ? ` · ${name}` : ""}`,
        format: format || mapMtgoFormat(data.format || eventUrl),
        listQuality: "authoritative",
      });
    }

    return decks;
  } catch (e) {
    console.warn("[mtgo] event", e.message);
    return [];
  }
}

export async function collectMtgo() {
  console.log("  mtgo: index…");
  const index = await fetchMtgoIndex();
  console.log(`  mtgo: ${index.length} event links`);

  const tournaments = index.slice(0, 20).map((e, i) => ({
    id: `mtgo-${e.slug || i}`,
    name: e.name || e.slug,
    format: e.format || "standard",
    platform: "mtgo",
    date:
      (e.slug || "").match(/(\d{4}-\d{2}-\d{2})/)?.[1] ||
      new Date().toISOString().slice(0, 10),
    url: e.url,
    topDecks: [],
    notes: "Official MTGO published decklists",
    source: "mtgo",
  }));

  // Prefer high-priority Standard challenges; also grab one Historic/Pioneer if present
  const byFormat = {
    standard: index.filter((e) => e.format === "standard").slice(0, 3),
    historic: index.filter((e) => e.format === "historic").slice(0, 1),
    pioneer: index.filter((e) => e.format === "pioneer").slice(0, 1),
    timeless: index.filter((e) => e.format === "timeless").slice(0, 1),
  };

  const toFetch = [
    ...byFormat.standard,
    ...byFormat.historic,
    ...byFormat.pioneer,
    ...byFormat.timeless,
  ].slice(0, 5);

  const lists = [];
  for (const e of toFetch) {
    await sleep(400);
    const decks = await fetchMtgoEventDecks(e.url, e.format);
    lists.push(...decks);
    console.log(`  mtgo: ${decks.length} decks from ${e.slug}`);
  }

  return { tournaments, lists };
}
