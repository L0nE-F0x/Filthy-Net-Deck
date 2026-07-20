/**
 * Official magic.gg decklist publications.
 *
 * Tournament links: always collected from the index.
 * Full-list assignment (C3, safe path): articles embed structured
 * `<deck-list><main-deck>…</main-deck><side-board>…</side-board></deck-list>`
 * blocks (often inside the Nuxt SSR payload). We only accept lists that:
 *   1. Parse from those tags (never free-form HTML card runs),
 *   2. Have a mainboard of ≥55 cards after Scryfall validation (caller),
 *   3. Score onto a Goldfish tile via listMatch (same gates as MTGO).
 *
 * The old flattened-HTML regex scraper corrupted names and deck boundaries;
 * that path is gone permanently.
 */
import { getText, sleep } from "./common.mjs";

function mapFormatFromSlug(slug = "") {
  if (/historic/i.test(slug)) return "historic";
  if (/pioneer|explorer/i.test(slug)) return "pioneer";
  if (/alchemy/i.test(slug)) return "alchemy";
  if (/timeless/i.test(slug)) return "timeless";
  if (/modern/i.test(slug)) return "modern";
  if (/legacy/i.test(slug)) return "legacy";
  if (/vintage/i.test(slug)) return "vintage";
  if (/cube/i.test(slug)) return "cube";
  if (/draft/i.test(slug)) return "draft";
  if (/brawl/i.test(slug) && /standard/i.test(slug)) return "standard_brawl";
  if (/brawl/i.test(slug)) return "brawl";
  if (/standard/i.test(slug)) return "standard";
  return "unknown";
}

/** Formats we may assign onto the 8×8 grid. */
const ASSIGNABLE = new Set(["standard", "pioneer"]);

/**
 * Unescape common Nuxt / JSON string escapes so tag regexes can match.
 */
export function unescapeArticleHtml(raw = "") {
  return String(raw)
    .replace(/\\u003c/gi, "<")
    .replace(/\\u003e/gi, ">")
    .replace(/\\u002f/gi, "/")
    .replace(/\\u0026/gi, "&")
    .replace(/\\u0027/gi, "'")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t");
}

/**
 * Parse `N Card Name` lines into { count, name } rows.
 * Skips empty lines and section headers.
 */
export function parseCardLines(text = "") {
  const out = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    // "4 Lightning Bolt" / "1 Brazen Borrower // Petty Theft"
    const m = /^(\d+)\s+(.+)$/.exec(line);
    if (!m) continue;
    const count = Number(m[1]);
    const name = m[2].trim();
    if (!count || !name || count > 99) continue;
    // Skip obvious junk / headers that snuck through
    if (/^(deck|sideboard|main|companion)\b/i.test(name)) continue;
    out.push({ count, name });
  }
  return out;
}

function attr(attrs, name) {
  const re = new RegExp(`${name}="([^"]*)"`, "i");
  const m = re.exec(attrs || "");
  return m ? m[1] : "";
}

/**
 * Extract structured deck lists from article HTML (or Nuxt-escaped body).
 * Only `<deck-list>` blocks with `<main-deck>` are accepted.
 *
 * @returns {Array<{ player: string, eventName: string, format: string, mainboard: object[], sideboard: object[], sourceUrl?: string }>}
 */
export function parseMagicGgDecklists(html, meta = {}) {
  const text = unescapeArticleHtml(html);
  const lists = [];
  const blockRe = /<deck-list([^>]*)>([\s\S]*?)<\/deck-list>/gi;
  let m;
  while ((m = blockRe.exec(text)) !== null) {
    const attrs = m[1] || "";
    const body = m[2] || "";
    const mainM = /<main-deck>([\s\S]*?)<\/main-deck>/i.exec(body);
    if (!mainM) continue;
    const sideM = /<side-board>([\s\S]*?)<\/side-board>/i.exec(body);
    const mainboard = parseCardLines(mainM[1]);
    const sideboard = sideM ? parseCardLines(sideM[1]) : [];
    const mainCount = mainboard.reduce((n, c) => n + c.count, 0);
    // Constructed 60s only — skip draft piles / partial scrapes
    if (mainCount < 55 || mainCount > 80) continue;
    if (mainboard.length < 8) continue;

    const format =
      mapFormatFromSlug(attr(attrs, "format")) !== "unknown"
        ? mapFormatFromSlug(attr(attrs, "format"))
        : meta.format || "unknown";
    // Prefer explicit format attr; mapFormatFromSlug("Standard") → standard via /standard/i
    const fmtAttr = attr(attrs, "format");
    const resolvedFormat = fmtAttr
      ? mapFormatFromSlug(fmtAttr.toLowerCase().replace(/\s+/g, "-"))
      : format;

    lists.push({
      player: attr(attrs, "deck-title") || attr(attrs, "subtitle") || "magic.gg pilot",
      eventName:
        attr(attrs, "event-name") ||
        meta.eventName ||
        meta.title ||
        "magic.gg decklists",
      eventDate: attr(attrs, "event-date") || meta.date || "",
      format: resolvedFormat === "unknown" && /standard/i.test(fmtAttr)
        ? "standard"
        : resolvedFormat === "unknown" && /pioneer/i.test(fmtAttr)
          ? "pioneer"
          : resolvedFormat === "unknown"
            ? meta.format || "unknown"
            : resolvedFormat,
      mainboard,
      sideboard,
      sourceUrl: meta.url || "",
      source: "magic.gg",
    });
  }
  return lists;
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
    if (/cube|draft/i.test(slug)) continue;
    const format = mapFormatFromSlug(slug);
    links.push({
      url: `https://magic.gg${path}`,
      slug,
      title: slug.replace(/-/g, " "),
      format,
    });
  }
  return links.slice(0, 40);
}

/**
 * Collect recent magic.gg articles as tournament *links* (topDecks empty).
 * List assignment uses {@link fetchMagicGgListPool} separately.
 */
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
      (a.slug || "").match(
        /(january|february|march|april|may|june|july|august|september|october|november|december)-(\d{1,2})-(\d{4})/i,
      )
        ? new Date(`${RegExp.$1} ${RegExp.$2}, ${RegExp.$3}`).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10),
    url: a.url,
    topDecks: [],
    notes: "Official magic.gg decklist publication",
    source: "magic.gg",
  }));

  return { tournaments };
}

/**
 * C3: pool of Scryfall-ready candidate 60s for a format, from recent
 * magic.gg articles that match Standard/Pioneer. Caller validates + scores.
 *
 * @param {"standard"|"pioneer"} formatId
 * @param {{ maxArticles?: number, maxLists?: number }} [opts]
 */
export async function fetchMagicGgListPool(formatId, opts = {}) {
  const maxArticles = opts.maxArticles ?? 3;
  const maxLists = opts.maxLists ?? 96;
  const format = String(formatId || "").toLowerCase();
  if (!ASSIGNABLE.has(format)) return [];

  let index;
  try {
    index = await fetchMagicGgIndex();
  } catch (e) {
    console.warn(`  [magic.gg] index failed: ${e.message}`);
    return [];
  }

  const articles = index
    .filter((a) => a.format === format)
    .slice(0, maxArticles);

  const pool = [];
  for (const art of articles) {
    try {
      await sleep(350);
      const html = await getText(art.url);
      const lists = parseMagicGgDecklists(html, {
        url: art.url,
        title: art.title,
        format: art.format,
        eventName: art.title,
      });
      let n = 0;
      for (const list of lists) {
        // Prefer lists whose embedded format matches (or is unknown → keep)
        const f = String(list.format || "").toLowerCase();
        if (f && f !== "unknown" && f !== format) continue;
        pool.push({
          player: list.player,
          eventName: list.eventName,
          sourceUrl: art.url,
          mainboard: list.mainboard,
          sideboard: list.sideboard,
          source: "magic.gg",
        });
        n++;
        if (pool.length >= maxLists) break;
      }
      console.log(`  [magic.gg] ${art.slug}: ${n} constructed lists`);
    } catch (e) {
      console.warn(`  [magic.gg] article ${art.slug}: ${e.message}`);
    }
    if (pool.length >= maxLists) break;
  }
  return pool;
}
