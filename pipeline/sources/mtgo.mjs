/**
 * MTGO official decklists.
 *
 * - Tournament *links* for the Events strip (collectMtgoTournaments)
 * - Full main/side lists from embedded `window.MTGO.decklists.data` for C3
 *   multi-source assignment onto Goldfish archetype tiles.
 *
 * Only Standard / Pioneer events are used for list assignment — never map
 * Modern/Legacy/etc. onto Arena formats.
 */
import { getText, sleep } from "./common.mjs";
import { normalizeMtgoCardName } from "./mtgoNames.mjs";

function mapMtgoFormat(slug = "") {
  const s = String(slug).toLowerCase();
  if (/pioneer/.test(s)) return "pioneer";
  if (/modern/.test(s)) return "modern";
  if (/legacy/.test(s)) return "legacy";
  if (/vintage/.test(s)) return "vintage";
  if (/pauper/.test(s)) return "pauper";
  if (/standard/.test(s)) return "standard";
  return "other";
}

function eventPriority(slug = "") {
  const s = slug.toLowerCase();
  if (/limited|sealed|draft|cube/.test(s)) return 0;
  if (/showcase|championship/.test(s)) return 100;
  if (/challenge/.test(s)) return 95;
  if (/super-qualifier|qualifier/.test(s)) return 85;
  if (/preliminary|prelim/.test(s)) return 60;
  if (/league/.test(s)) return 20;
  return 40;
}

/** Brace-balanced extract of `window.MTGO.decklists.data = {...}`. */
export function extractMtgoDecklistsData(html) {
  const marker = "window.MTGO.decklists.data = ";
  const i = html.indexOf(marker);
  if (i < 0) return null;
  let j = i + marker.length;
  while (html[j] && /\s/.test(html[j])) j++;
  if (html[j] !== "{") return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let k = j; k < html.length; k++) {
    const c = html[k];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(j, k + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function cardsFromMtgoRows(arr) {
  // MTGO repeats a card across rows (one per printing) and names UB
  // dual-identity cards by printed alias — normalize, then merge by name.
  /** @type {Map<string, number>} */
  const byName = new Map();
  for (const row of arr || []) {
    const raw = row?.card_attributes?.card_name;
    const qty = Number(row?.qty) || 0;
    if (!raw || qty < 1) continue;
    const name = normalizeMtgoCardName(raw);
    byName.set(name, (byName.get(name) || 0) + qty);
  }
  return [...byName].map(([name, count]) => ({ count, name }));
}

/**
 * Normalize one MTGO event payload into plain main/side lists.
 * @returns {{ player: string, mainboard: {count:number,name:string}[], sideboard: {count:number,name:string}[], sourceUrl: string, eventName: string }[]}
 */
export function parseMtgoEventLists(data, sourceUrl = "") {
  if (!data?.decklists?.length) return [];
  const eventName = data.description || data.site_name || "MTGO event";
  const out = [];
  for (const d of data.decklists) {
    const mainboard = cardsFromMtgoRows(d.main_deck);
    const sideboard = cardsFromMtgoRows(d.sideboard_deck);
    const mainCount = mainboard.reduce((n, c) => n + c.count, 0);
    if (mainCount < 55 || mainCount > 65) continue;
    out.push({
      player: d.player || d.login_name || "unknown",
      mainboard,
      sideboard,
      sourceUrl,
      eventName,
      source: "mtgo",
    });
  }
  return out;
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
      const seen = new Set();
      let m;
      while ((m = re.exec(html)) !== null) {
        if (seen.has(m[1])) continue;
        seen.add(m[1]);
        const slug = m[1].replace("/decklist/", "");
        if (/limited|sealed|draft|cube|momir|commander|edh/i.test(slug)) continue;
        links.push({
          url: `https://www.mtgo.com${m[1]}`,
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
  return [];
}

/**
 * Pull recent Standard or Pioneer challenge-class events and return a pool of
 * real 60s for archetype matching. Network-only; returns [] on total failure.
 *
 * @param {"standard"|"pioneer"} formatId
 * @param {{ maxEvents?: number, maxDecks?: number }} [opts]
 */
export async function fetchMtgoListPool(formatId, opts = {}) {
  const maxEvents = opts.maxEvents ?? 3;
  const maxDecks = opts.maxDecks ?? 96;
  const index = await fetchMtgoIndex();
  const events = index
    .filter((e) => e.format === formatId && e.priority >= 60)
    .slice(0, maxEvents);

  const pool = [];
  for (const ev of events) {
    try {
      await sleep(350);
      const html = await getText(ev.url);
      const data = extractMtgoDecklistsData(html);
      const lists = parseMtgoEventLists(data, ev.url);
      console.log(`  [mtgo] ${ev.slug}: ${lists.length} lists`);
      for (const list of lists) {
        pool.push(list);
        if (pool.length >= maxDecks) return pool;
      }
    } catch (e) {
      console.warn(`  [mtgo] event ${ev.slug}: ${e.message}`);
    }
  }
  return pool;
}

export async function collectMtgoTournaments() {
  const index = await fetchMtgoIndex();
  console.log(`  mtgo: ${index.length} event links`);

  const tournaments = index.slice(0, 15).map((e, i) => ({
    id: `mtgo-${e.slug || i}`,
    name: e.name || e.slug,
    format: e.format || "other",
    platform: "mtgo",
    date:
      (e.slug || "").match(/(\d{4}-\d{2}-\d{2})/)?.[1] ||
      new Date().toISOString().slice(0, 10),
    url: e.url,
    topDecks: [],
    notes: "Official MTGO published decklists",
    source: "mtgo",
  }));

  return { tournaments };
}
