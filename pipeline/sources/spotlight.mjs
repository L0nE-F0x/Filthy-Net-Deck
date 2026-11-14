/**
 * Premier-event spotlight.
 *
 * One calendar row per Wizards event whose constructed format is Standard or
 * Pioneer. The pipeline reads the magic.gg event page, the latest round
 * standings article, and the structured `<deck-list>` pages. The app shows
 * the result while the event is on, keeps the top 8 for a week, then the
 * sidebar chip goes away. No new installer per event.
 *
 * Deck lists only come from `<deck-list>` blocks (see magic-gg.mjs). The
 * flattened card-run articles are not a fallback.
 */
import { getText, sleep } from "./common.mjs";
import { parseMagicGgDecklists, unescapeArticleHtml } from "./magic-gg.mjs";

/**
 * Hand-maintained. Add a row when Wizards announces dates.
 * `showcaseUntil` is the last local day the top 8 stay in the app.
 */
export const SPOTLIGHT_CALENDAR = [
  {
    id: "wc32",
    name: "World Championship 32",
    format: "standard",
    starts: "2026-11-13",
    ends: "2026-11-15",
    showcaseUntil: "2026-11-22",
    eventUrl: "https://magic.gg/events/magic-world-championship-32",
  },
];

const SKIP_ARTICLE = /spiciest|breakdown|metagame|invitation|viewer|inside-/i;

export function utcDay(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/** The calendar row whose window contains `day`, latest start first. */
export function selectCalendarEntry(calendar, day) {
  const open = (calendar || []).filter(
    (e) => e && e.starts && e.showcaseUntil && day >= e.starts && day <= e.showcaseUntil,
  );
  open.sort((a, b) => String(b.starts).localeCompare(String(a.starts)));
  return open[0] ?? null;
}

function addUtcDays(iso, n) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return "";
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n));
  return dt.toISOString().slice(0, 10);
}

/**
 * Hourly refresh window: the event days, plus the next UTC day.
 * A final article posted just after midnight UTC (late evening at the venue)
 * still lands. The showcase week is not part of this window.
 */
export function selectLiveEntry(calendar, day) {
  const open = (calendar || []).filter((e) => {
    if (!e?.starts || !e?.ends) return false;
    const tail = addUtcDays(e.ends, 1);
    return Boolean(tail) && day >= e.starts && day <= tail;
  });
  open.sort((a, b) => String(b.starts).localeCompare(String(a.starts)));
  return open[0] ?? null;
}

/** True when two feeds match aside from generatedAt. */
export function sameSpotlightPayload(a, b) {
  const strip = (feed) => {
    if (!feed || typeof feed !== "object") return "";
    const copy = { ...feed };
    delete copy.generatedAt;
    return JSON.stringify(copy);
  };
  return strip(a) === strip(b);
}

export function foldName(raw) {
  return String(raw || "")
    // magic.gg sometimes replaces a combining mark with a literal "?".
    .replace(/[?�]/g, "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "Ichikawa, Yuuki" and "Yuuki Ichikawa" share a key. Token-sorted too. */
export function standingNameKeys(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return [];
  const comma = /^(.*?),\s*(.+)$/.exec(trimmed);
  const phrases = comma
    ? [`${comma[2]} ${comma[1]}`, `${comma[1]} ${comma[2]}`]
    : [trimmed];
  const keys = new Set();
  for (const phrase of phrases) {
    const folded = foldName(phrase);
    if (!folded) continue;
    keys.add(folded);
    keys.add(folded.split(" ").sort().join(" "));
  }
  return [...keys];
}

export function deckNameKeys(player) {
  const folded = foldName(player);
  if (!folded) return [];
  return [folded, folded.split(" ").sort().join(" ")];
}

function slug(player, used) {
  const base = foldName(player).replace(/\s+/g, "-") || "pilot";
  let id = base;
  let n = 2;
  while (used.has(id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  used.add(id);
  return id;
}

function nameTokens(raw) {
  const folded = foldName(raw);
  return folded ? folded.split(" ") : [];
}

/**
 * Second pass for the leftovers an exact key misses:
 * a short first name (Sam / Samuel), a clipped last name
 * (Stefans / Stefansson), or one extra token (Puglisi / Puglisi Clark).
 * Assigns only when exactly one unused deck fits.
 */
function fuzzyDeckId(standingPlayer, decks, used) {
  const comma = /^(.*?),\s*(.+)$/.exec(String(standingPlayer || "").trim());
  if (!comma) return null;
  const last = foldName(comma[1]);
  const first = foldName(comma[2]);
  if (!last || !first) return null;
  const standingTokens = new Set(nameTokens(`${first} ${last}`));
  const hits = [];
  for (const deck of decks) {
    if (used.has(deck.id)) continue;
    const tokens = nameTokens(deck.player);
    if (tokens.length < 2) continue;
    const deckLast = tokens[tokens.length - 1];
    const deckFirst = tokens.slice(0, -1).join(" ");
    const sameLast = deckLast === last;
    const lastExtra = Math.abs(deckLast.length - last.length);
    const lastShorter = Math.min(deckLast.length, last.length);
    // A clipped or accent-damaged surname (Stefans / Stefansson, Kho / Khoo).
    // Short names only allow a one- or two-letter difference.
    const lastPrefix =
      lastExtra >= 1 &&
      lastShorter >= 3 &&
      lastExtra <= 4 &&
      (lastShorter >= 5 || lastExtra <= 2) &&
      (deckLast.startsWith(last) || last.startsWith(deckLast));
    const sameFirst = deckFirst === first;
    const firstPrefix =
      deckFirst.length >= 3 &&
      first.length >= 3 &&
      (deckFirst.startsWith(first) || first.startsWith(deckFirst)) &&
      Math.abs(deckFirst.length - first.length) <= 4;
    const deckTokenSet = new Set(tokens);
    const subset =
      standingTokens.size >= 2 &&
      deckTokenSet.size >= 2 &&
      Math.abs(standingTokens.size - deckTokenSet.size) === 1 &&
      (tokens.every((t) => standingTokens.has(t)) ||
        [...standingTokens].every((t) => deckTokenSet.has(t)));
    if ((sameLast && (sameFirst || firstPrefix)) || (sameFirst && lastPrefix) || subset) {
      hits.push(deck.id);
    }
  }
  return hits.length === 1 ? hits[0] : null;
}

/**
 * Attach a deck id to each standing. A deck is used at most once.
 * Unmatched standings keep `deckId: null`.
 */
export function joinStandings(decks, standings) {
  const byKey = new Map();
  for (const deck of decks) {
    for (const key of deckNameKeys(deck.player)) {
      if (!byKey.has(key)) byKey.set(key, deck.id);
    }
  }
  const used = new Set();
  const exact = (standings || []).map((row) => {
    let deckId = null;
    for (const key of standingNameKeys(row.player)) {
      const id = byKey.get(key);
      if (id && !used.has(id)) {
        deckId = id;
        used.add(id);
        break;
      }
    }
    return { ...row, deckId };
  });
  return exact.map((row) => {
    if (row.deckId) return row;
    const deckId = fuzzyDeckId(row.player, decks, used);
    if (!deckId) return row;
    used.add(deckId);
    return { ...row, deckId };
  });
}

function cellText(raw) {
  return String(raw || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Rank / Player / Points / OMW% table from a magic.gg standings article. */
export function parseStandingsTable(html) {
  const text = unescapeArticleHtml(html);
  const rows = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = rowRe.exec(text)) !== null) {
    const cells = [];
    const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let c;
    while ((c = cellRe.exec(m[1])) !== null) cells.push(cellText(c[1]));
    if (cells.length < 3) continue;
    const rank = Number(cells[0]);
    if (!Number.isInteger(rank) || rank < 1 || rank > 5000) continue;
    const player = cells[1];
    const points = Number(cells[2]);
    if (!player || !Number.isFinite(points)) continue;
    const omwRaw = cells[3] != null && cells[3] !== "" ? Number(cells[3]) : null;
    rows.push({
      rank,
      player,
      points,
      omw: omwRaw != null && Number.isFinite(omwRaw) ? omwRaw : null,
    });
  }
  // The article HTML includes the table twice (rendered body + payload).
  const seen = new Set();
  const unique = [];
  for (const row of rows) {
    if (seen.has(row.rank)) continue;
    seen.add(row.rank);
    unique.push(row);
  }
  unique.sort((a, b) => a.rank - b.rank);
  return unique;
}

function absMagic(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `https://magic.gg${path.startsWith("/") ? "" : "/"}${path}`;
}

/**
 * Pull standings articles, decklist articles, and direct /decklists/ pages
 * out of an event page or a news article.
 */
export function classifyMagicLinks(html) {
  const text = unescapeArticleHtml(html);
  const standings = [];
  const articles = [];
  const deckPages = [];
  const seen = new Set();
  const re = /href="([^"]+)"/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    let href = m[1].replace(/&amp;/g, "&");
    if (href.startsWith("http") && !/^https?:\/\/(?:www\.)?magic\.gg\//i.test(href)) continue;
    const path = href.startsWith("http")
      ? new URL(href).pathname
      : href.split("?")[0].split("#")[0];
    if (seen.has(path)) continue;
    const round = /\/news\/[^"]*?round-(\d+)-standings\/?$/i.exec(path) ||
      /round-(\d+)-standings/i.exec(path);
    if (round && /standings/i.test(path)) {
      seen.add(path);
      standings.push({ round: Number(round[1]), url: absMagic(path) });
      continue;
    }
    if (/^\/decklists\/[a-z0-9-]+$/i.test(path) && !/cube|draft/i.test(path)) {
      seen.add(path);
      deckPages.push(absMagic(path));
      continue;
    }
    if (/^\/news\/[a-z0-9-]*decklist/i.test(path) && !SKIP_ARTICLE.test(path)) {
      seen.add(path);
      articles.push(absMagic(path));
    }
  }
  standings.sort((a, b) => b.round - a.round);
  return { standings, articles, deckPages };
}

async function fetchDecklists(urls, format) {
  const decks = [];
  const usedIds = new Set();
  const seenPlayers = new Set();
  for (const url of urls) {
    let html;
    try {
      html = await getText(url);
    } catch (e) {
      console.warn(`  spotlight: deck page failed ${url}: ${e.message}`);
      continue;
    }
    const lists = parseMagicGgDecklists(html, { url, format });
    for (const list of lists) {
      if (list.format !== format) continue;
      const playerKey = foldName(list.player);
      if (!playerKey || seenPlayers.has(playerKey)) continue;
      seenPlayers.add(playerKey);
      decks.push({
        id: slug(list.player, usedIds),
        player: list.player,
        archetype: list.archetype || "",
        mainboard: list.mainboard,
        sideboard: list.sideboard || [],
        sourceUrl: list.sourceUrl || url,
      });
    }
    await sleep(200);
  }
  return decks;
}

/**
 * @returns {Promise<{ generatedAt: string, event: object | null }>}
 */
export async function buildSpotlightFeed(now = new Date(), opts = {}) {
  const calendar = opts.calendar || SPOTLIGHT_CALENDAR;
  const day = utcDay(now);
  const entry = selectCalendarEntry(calendar, day);
  const generatedAt = now.toISOString();
  if (!entry) {
    console.log(`  spotlight: no event in window on ${day}`);
    return { generatedAt, event: null };
  }

  console.log(`  spotlight: ${entry.name}`);
  const eventHtml = await getText(entry.eventUrl);
  let found = classifyMagicLinks(eventHtml);
  const deckPages = [...found.deckPages];
  if (deckPages.length === 0) {
    for (const article of found.articles.slice(0, 4)) {
      try {
        const html = await getText(article);
        const inner = classifyMagicLinks(html);
        for (const page of inner.deckPages) {
          if (!deckPages.includes(page)) deckPages.push(page);
        }
        await sleep(200);
      } catch (e) {
        console.warn(`  spotlight: article failed ${article}: ${e.message}`);
      }
    }
  }

  const decks = await fetchDecklists(deckPages, entry.format);
  const latest = found.standings[0] || null;
  let standings = [];
  if (latest) {
    try {
      const html = await getText(latest.url);
      standings = parseStandingsTable(html);
    } catch (e) {
      console.warn(`  spotlight: standings failed ${latest.url}: ${e.message}`);
    }
  }
  const joined = joinStandings(decks, standings);
  const matched = joined.filter((r) => r.deckId).length;
  console.log(
    `  spotlight: ${decks.length} lists, round ${latest?.round ?? "—"}, ${matched}/${joined.length} matched`,
  );

  return {
    generatedAt,
    event: {
      id: entry.id,
      name: entry.name,
      format: entry.format,
      starts: entry.starts,
      ends: entry.ends,
      showcaseUntil: entry.showcaseUntil,
      eventUrl: entry.eventUrl,
      standingsRound: latest?.round ?? null,
      standingsUrl: latest?.url ?? null,
      decks,
      standings: joined,
    },
  };
}
