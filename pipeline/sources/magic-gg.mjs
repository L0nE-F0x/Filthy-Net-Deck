/**
 * Official magic.gg decklist publications — used for tournament links ONLY.
 *
 * The old version regex-scraped flattened article HTML into "decks", which
 * corrupted card names and deck boundaries; those lists then got fuzzy-matched
 * onto the wrong archetypes. Deck lists now come exclusively from the
 * goldfish + scryfall path in build-meta.mjs.
 */
import { getText } from "./common.mjs";

function mapFormatFromSlug(slug = "") {
  if (/historic/i.test(slug)) return "historic";
  if (/pioneer|explorer/i.test(slug)) return "pioneer";
  if (/alchemy/i.test(slug)) return "alchemy";
  if (/timeless/i.test(slug)) return "timeless";
  if (/modern/i.test(slug)) return "modern";
  if (/legacy/i.test(slug)) return "legacy";
  if (/vintage/i.test(slug)) return "vintage";
  if (/brawl/i.test(slug) && /standard/i.test(slug)) return "standard_brawl";
  if (/brawl/i.test(slug)) return "brawl";
  return "standard";
}

export async function fetchMagicGgIndex() {
  const html = await getText("https://magic.gg/decklists");
  const links = [];
  const re = /href="(\/decklists\/[a-z0-9-]+)"/gi;
  const seen = new Set();
  let m;
  while ((m = re.exec(html)) !== null) {
    const path = m[1];
    if (seen.has(path)) continue;
    seen.add(path);
    const slug = path.replace("/decklists/", "");
    if (/cube/i.test(slug)) continue;
    links.push({
      url: `https://magic.gg${path}`,
      slug,
      title: slug.replace(/-/g, " "),
      format: mapFormatFromSlug(slug),
    });
  }
  return links.slice(0, 24);
}

export async function collectMagicGgTournaments() {
  let index = [];
  try {
    index = await fetchMagicGgIndex();
  } catch (e) {
    console.warn("  magic.gg index failed", e.message);
  }
  console.log(`  magic.gg: ${index.length} article links`);

  const tournaments = index.slice(0, 12).map((a, i) => ({
    id: `magicgg-${a.slug || i}`,
    name: a.title || a.slug || "magic.gg decklists",
    format: a.format || "standard",
    platform: /arena|ranked|traditional/i.test(a.title || a.slug || "")
      ? "mtga"
      : "paper",
    date:
      (a.slug || "").match(/(january|february|march|april|may|june|july|august|september|october|november|december)-(\d{1,2})-(\d{4})/i)
        ? new Date(`${RegExp.$1} ${RegExp.$2}, ${RegExp.$3}`).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10),
    url: a.url,
    topDecks: [],
    notes: "Official magic.gg decklist publication",
    source: "magic.gg",
  }));

  return { tournaments };
}
