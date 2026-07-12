/**
 * MTGGoldfish — single source of truth for archetype identity + lists.
 *
 * Two endpoints, both server-rendered HTML (NOT Cloudflare-challenged as of 2026-07):
 *   /metagame/<format>      → archetype tiles: name, slug, colors, meta %, key cards
 *   /archetype/<slug>       → representative decklist embedded in deck_input[deck]
 *
 * The old approach (deck/arena_download/<id>) returns 403 "Just a moment" and
 * must not be used.
 */
import { getText, sleep } from "./common.mjs";

const BASE = "https://www.mtggoldfish.com";

function decodeEntities(s) {
  return String(s)
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

const COLOR_WORDS = {
  white: "W",
  blue: "U",
  black: "B",
  red: "R",
  green: "G",
};

/**
 * Parse archetype tiles from a metagame page.
 * @returns [{ name, slug, colors, metaPct, sampleSize, keyCards, url }]
 */
export function parseMetagameTiles(html) {
  const tiles = [];
  const chunks = String(html).split("class='archetype-tile'");
  for (let i = 1; i < chunks.length; i++) {
    const c = chunks[i];

    const slugM = c.match(/href="\/archetype\/([a-z0-9-]+)(?:#[a-z]+)?"/i);
    if (!slugM) continue;
    const slug = slugM[1];

    const nameM = c.match(
      /href="\/archetype\/[a-z0-9-]+(?:#[a-z]+)?">([^<]+)<\/a>/i,
    );
    const name = nameM ? decodeEntities(nameM[1].trim()) : null;
    if (!name) continue;

    const colors = [];
    const colorM = c.match(/aria-label='colors:\s*([a-z ]+)'/i);
    if (colorM) {
      for (const w of colorM[1].trim().split(/\s+/)) {
        const code = COLOR_WORDS[w.toLowerCase()];
        if (code && !colors.includes(code)) colors.push(code);
      }
    }

    let metaPct;
    let sampleSize;
    const pctM = c.match(
      /META%[\s\S]{0,400}?([\d.]+)%\s*(?:<span[^>]*>\s*\((\d+)\)\s*<\/span>)?/i,
    );
    if (pctM) {
      metaPct = parseFloat(pctM[1]);
      if (pctM[2]) sampleSize = parseInt(pctM[2], 10);
    }

    const keyCards = [...c.matchAll(/<li>([^<]+)<\/li>/g)]
      .map((m) => decodeEntities(m[1].trim()))
      .filter(Boolean)
      .slice(0, 3);

    // Tiles are duplicated per view (online/paper) in some layouts — dedupe by slug
    if (tiles.some((t) => t.slug === slug)) continue;

    tiles.push({
      name,
      slug,
      colors,
      metaPct: Number.isFinite(metaPct) ? metaPct : undefined,
      sampleSize,
      keyCards,
      url: `${BASE}/archetype/${slug}`,
    });
  }
  return tiles;
}

export async function fetchMetagameTiles(formatPath) {
  const url = `${BASE}/metagame/${formatPath}#paper`;
  const html = await getText(url);
  const tiles = parseMetagameTiles(html);
  return { url: `${BASE}/metagame/${formatPath}`, tiles };
}

/**
 * Parse the representative decklist out of an archetype page.
 * The page embeds the full list in a hidden form:
 *   <input name="deck_input[deck]" id="deck_input_deck" value="4 Card\n...sideboard\n..." />
 * Lines repeat per printing — merge duplicates by name within each section.
 */
export function parseArchetypeDeckPage(html) {
  const anchor = String(html).indexOf('id="deck_input_deck"');
  if (anchor < 0) return null;
  const valStart = html.indexOf('value="', anchor);
  if (valStart < 0) return null;
  const start = valStart + 'value="'.length;
  const end = html.indexOf('"', start);
  if (end < 0) return null;
  const raw = decodeEntities(html.slice(start, end));

  const main = new Map();
  const side = new Map();
  let section = main;
  for (const lineRaw of raw.split("\n")) {
    const line = lineRaw.trim();
    if (!line) continue;
    if (/^sideboard$/i.test(line)) {
      section = side;
      continue;
    }
    const m = line.match(/^(\d+)\s+(.+)$/);
    if (!m) continue;
    const count = parseInt(m[1], 10);
    const name = m[2].trim();
    if (!name || count < 1) continue;
    section.set(name, (section.get(name) || 0) + count);
  }

  const mainboard = [...main].map(([name, count]) => ({ count, name }));
  const sideboard = [...side].map(([name, count]) => ({ count, name }));
  const mainCount = mainboard.reduce((s, c) => s + c.count, 0);
  if (!mainboard.length) return null;

  const deckIdM = html.match(/\/deck\/download\/(\d+)/);
  const nameM = html.match(/id="deck_input_name" value="([^"]*)"/);
  const formatM = html.match(/id="deck_input_format" value="([^"]*)"/);
  const commanderM = html.match(/id="deck_input_commander" value="([^"]*)"/);

  return {
    mainboard,
    sideboard,
    mainCount,
    deckId: deckIdM ? deckIdM[1] : undefined,
    deckName: nameM ? decodeEntities(nameM[1]) : undefined,
    goldfishFormat: formatM ? formatM[1] : undefined,
    commander: commanderM && commanderM[1] ? decodeEntities(commanderM[1]) : undefined,
  };
}

/** Fetch one archetype's representative list. Returns null when unusable. */
export async function fetchArchetypeDeck(slug) {
  const url = `${BASE}/archetype/${slug}#paper`;
  try {
    const html = await getText(url);
    const parsed = parseArchetypeDeckPage(html);
    if (!parsed) return null;
    if (parsed.mainCount < 40 || parsed.mainCount > 110) return null;
    return { ...parsed, url: `${BASE}/archetype/${slug}` };
  } catch (e) {
    console.warn(`  [goldfish] archetype ${slug}: ${e.message}`);
    return null;
  }
}
