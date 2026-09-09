/**
 * MythicSpoiler — freshest visual spoilers, ahead of Scryfall's catalog.
 *
 * Why this exists: Scryfall usually catalogs new cards within hours, but during
 * active spoiler season MythicSpoiler (and other visual-spoiler aggregators)
 * frequently posts a leaked/previewed card image before it hits the Scryfall
 * API. This source scrapes https://mythicspoiler.com/newspoilers.html (dated
 * newest-first grid) and, for sets currently spoiling, the per-set index page
 * so cards that have scrolled off "new spoilers" still attach. Then the radar
 * shows "just spoiled" cards the moment they surface — and drops them
 * automatically once Scryfall catches up.
 *
 * We take what the page reliably gives us: the set folder code (usually the
 * Scryfall set code — hob, trk, fra…), an optional date header ("SEPTEMBER 8"),
 * and the card slug (image filename, same key as a lowercased Scryfall name).
 * Early first-looks sometimes land in a generic `mtg/` folder; those are
 * remapped via the header's set name. We do NOT trust the slug as an
 * authoritative display name — the card image carries the real name. Dedup /
 * self-heal against Scryfall is done by the merge step in sets.mjs using
 * normalizeSlug(scryfallName) === slug.
 */

const BASE = "https://mythicspoiler.com";
const NEW_SPOILERS_URL = `${BASE}/newspoilers.html`;
const HEADERS = {
  Accept: "text/html,application/xhtml+xml",
  "User-Agent": "FilthyNetDeck/pipeline (+https://github.com/L0nE-F0x/Filthy-Net-Deck)",
};

/** Folders that are not Scryfall set codes — remap via the date-header set name. */
export const GENERIC_FOLDERS = new Set(["mtg", "set", "misc", "spoiler"]);

const MONTH_INDEX = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const MONTH_RE = "january|february|march|april|may|june|july|august|september|october|november|december";

/**
 * Normalize a Scryfall card name (or any string) to MythicSpoiler slug form:
 * lowercase, strip everything that isn't a-z0-9. This is the shared key used to
 * match a MythicSpoiler slug against a Scryfall gallery card.
 *   "Azog, Moria's Ruin" → "azogmoriasruin"
 *   "Delighted Halfling"  → "delightedhalfling"
 * DFC names ("Front // Back") normalize to "frontback" — a rare mismatch we
 * accept (worst case a card shows unconfirmed a little longer).
 */
export function normalizeSlug(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function normalizeSetName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Best-effort display label from a slug. Not authoritative — the card image is
 * the source of truth. We can't recover spaces/commas/apostrophes from a slug,
 * so this is only used as alt text / a search hint and is labeled unverified in
 * the UI.
 */
const BASIC_LAND_ART = /^(plains|island|swamp|mountain|forest)[tmb]$/;

/**
 * True when a MythicSpoiler slug is already represented in a Scryfall gallery.
 * Besides exact slug match this treats basic-land art variants (`plainst`,
 * `islandm`, `forestb`) as the corresponding basic once that basic is confirmed.
 *
 * @param {string} slug
 * @param {Set<string>} confirmed
 */
export function isConfirmedSlug(slug, confirmed) {
  if (!slug || !confirmed) return false;
  if (confirmed.has(slug)) return true;
  const m = String(slug).match(BASIC_LAND_ART);
  return Boolean(m && confirmed.has(m[1]));
}

export function deslugLabel(slug) {
  const s = String(slug || "").trim();
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Parse "SEPTEMBER 8" / "July 20" into YYYY-MM-DD.
 * Year is taken from `todayIso`; if the resulting date sits more than 60 days
 * in the future (a July header read in January), roll back one year.
 *
 * @param {string} text
 * @param {string} [todayIso] YYYY-MM-DD
 * @returns {string | null}
 */
export function parseMonthDay(text, todayIso) {
  const m = String(text || "").match(new RegExp(`\\b(${MONTH_RE})\\s+(\\d{1,2})\\b`, "i"));
  if (!m) return null;
  const month = MONTH_INDEX[m[1].toLowerCase()];
  const day = Number(m[2]);
  if (!month || day < 1 || day > 31) return null;
  const today = todayIso || new Date().toISOString().slice(0, 10);
  const year = Number(today.slice(0, 4));
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  const candidate = `${year}-${mm}-${dd}`;
  const todayMs = Date.parse(`${today}T12:00:00Z`);
  const candMs = Date.parse(`${candidate}T12:00:00Z`);
  if (Number.isFinite(candMs) && Number.isFinite(todayMs) && candMs - todayMs > 60 * 86400000) {
    return `${year - 1}-${mm}-${dd}`;
  }
  return candidate;
}

/**
 * Set name from a MythicSpoiler date header, minus the date itself and the
 * usual suffixes ("SPECIAL GUESTS", "SCENE CARDS", "TOKENS", "SHOWCASE").
 *   "SEPTEMBER 8 REALITY FRACTURE - SPECIAL GUESTS" → "REALITY FRACTURE"
 *   "JULY 18 THE HOBBIT - SCENE CARDS" → "THE HOBBIT"
 *
 * @param {string} headerText
 * @returns {string | null}
 */
export function parseSetLabel(headerText) {
  let s = String(headerText || "");
  s = s.replace(/<[^>]+>/g, " ");
  s = s.replace(/&nbsp;/gi, " ");
  s = s.replace(new RegExp(`\\b(${MONTH_RE})\\s+\\d{1,2}\\b`, "ig"), " ");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/\s*[-–—:]\s*(special guests|scene cards|tokens?|showcase|promo).*$/i, "");
  s = s.replace(/\s+/g, " ").trim();
  return s || null;
}

function cardRecord(folder, slug, spoiledAt, setLabel) {
  return {
    code: folder,
    slug,
    name: deslugLabel(slug),
    image: `${BASE}/${folder}/cards/${slug}.jpg`,
    sourceUrl: `${BASE}/${folder}/cards/${slug}.html`,
    ...(spoiledAt ? { spoiledAt } : {}),
    ...(setLabel ? { setLabel } : {}),
  };
}

/**
 * Parse newspoilers.html into per-set card lists, carrying the date header
 * each card appeared under.
 *
 * The page is a flat grid of blocks shaped like:
 *   <div class="grid-span">SEPTEMBER 8<br>REALITY FRACTURE</div>
 *   <div class="grid-card"><a href="fra/cards/loyaltutor.html">
 *     <img ... src="fra/cards/loyaltutor.jpg"></a> …credit link… </div>
 *
 * A card can appear under more than one date header, so we dedupe by
 * `${folder}/${slug}` and keep first-seen order (newest first on the page).
 *
 * @param {string} html
 * @param {string} [todayIso]
 * @returns {Array<{ code: string, slug: string, name: string, image: string, sourceUrl: string, spoiledAt?: string, setLabel?: string }>}
 */
export function parseNewSpoilers(html, todayIso) {
  const out = [];
  const seen = new Set();
  let spoiledAt = null;
  let setLabel = null;
  // Walk headers and card image paths in document order. Headers look like
  // "SEPTEMBER 8" (optionally followed by a set name in the same grid-span).
  const re = new RegExp(
    `(${MONTH_RE})\\s+(\\d{1,2})(?:\\s|<br\\s*/?>|&nbsp;)*([^<]{0,80})?` +
      `|\\b([a-z0-9]{2,6})\\/cards\\/([a-z0-9]+)\\.jpg\\b`,
    "gi",
  );
  let m;
  while ((m = re.exec(html))) {
    if (m[1]) {
      spoiledAt = parseMonthDay(`${m[1]} ${m[2]}`, todayIso);
      setLabel = parseSetLabel(`${m[1]} ${m[2]} ${m[3] || ""}`);
      continue;
    }
    const folder = m[4].toLowerCase();
    const slug = m[5].toLowerCase();
    if (!slug || slug === "cardname" || slug === "inviscard") continue;
    const key = `${folder}/${slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cardRecord(folder, slug, spoiledAt, setLabel));
  }
  return out;
}

/**
 * Parse a per-set MythicSpoiler index (`/{code}/index.html`). Image paths are
 * relative (`cards/slug.jpg`) so the caller supplies the set code. Showcase
 * frames (`slugp`, `slugp2`) are dropped when the regular-frame slug is also
 * on the page — they are alt arts of the same card, not extra spoilers.
 *
 * @param {string} html
 * @param {string} code
 * @returns {ReturnType<typeof parseNewSpoilers>}
 */
export function parseSetGallery(html, code) {
  const folder = String(code || "").toLowerCase();
  if (!folder) return [];
  const slugs = [];
  const seen = new Set();
  // Relative on the set index (`cards/foo.jpg`); also matches markdown-ish
  // scrapes of the same path. Do not require src=/href=.
  const re = /\bcards\/([a-z0-9]+)\.jpg\b/gi;
  let m;
  while ((m = re.exec(html))) {
    const slug = m[1].toLowerCase();
    if (!slug || slug === "cardname" || slug === "inviscard") continue;
    if (seen.has(slug)) continue;
    seen.add(slug);
    slugs.push(slug);
  }
  const present = new Set(slugs);
  const out = [];
  for (const slug of slugs) {
    // `ajaniresolutep` / `loyaltutorp2` are showcase frames of a slug we already have.
    const base = slug.replace(/p\d*$/, "");
    if (base !== slug && present.has(base)) continue;
    out.push(cardRecord(folder, slug, null, null));
  }
  return out;
}

/**
 * Remap cards that landed in a generic folder (`mtg/cards/…`) onto a real set
 * code using the date-header set name. Image URLs stay on the original folder
 * — that's where the file actually lives.
 *
 * @param {ReturnType<typeof parseNewSpoilers>} cards
 * @param {Map<string, string> | Record<string, string>} nameToCode
 *   keys = normalizeSetName(setName)
 */
export function remapGenericFolders(cards, nameToCode) {
  const lookup =
    nameToCode instanceof Map
      ? (k) => nameToCode.get(k)
      : (k) => nameToCode[k];
  return (cards || []).map((c) => {
    if (!GENERIC_FOLDERS.has(c.code)) return c;
    const mapped = lookup(normalizeSetName(c.setLabel || ""));
    if (!mapped) return c;
    return { ...c, code: String(mapped).toLowerCase() };
  });
}

/**
 * Merge two spoiler lists. `primary` (newspoilers — has dates, newest first)
 * wins on `${code}/${slug}`; `extra` fills gaps (typically a set index page).
 *
 * @param {ReturnType<typeof parseNewSpoilers>} primary
 * @param {ReturnType<typeof parseNewSpoilers>} extra
 */
export function mergeSpoilerLists(primary, extra) {
  const out = [...(primary || [])];
  const seen = new Set(out.map((c) => `${c.code}/${c.slug}`));
  for (const c of extra || []) {
    const key = `${c.code}/${c.slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/**
 * Group parsed cards by set code.
 * @param {ReturnType<typeof parseNewSpoilers>} cards
 * @returns {Record<string, Array<{ slug: string, name: string, image: string, sourceUrl?: string, spoiledAt?: string }>>}
 */
export function groupBySet(cards) {
  const by = {};
  for (const c of cards) {
    (by[c.code] ||= []).push({
      slug: c.slug,
      name: c.name,
      image: c.image,
      ...(c.sourceUrl ? { sourceUrl: c.sourceUrl } : {}),
      ...(c.spoiledAt ? { spoiledAt: c.spoiledAt } : {}),
    });
  }
  return by;
}

async function fetchHtml(url) {
  const res = await fetch(url, { headers: HEADERS, redirect: "follow" });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.text();
}

/**
 * Fetch + parse the live MythicSpoiler new-spoilers page, then (optionally)
 * the per-set index for codes still spoiling so older cards that scrolled off
 * newspoilers.html still attach.
 *
 * Fail-soft by design: any network/parse error returns whatever we already
 * have (possibly empty) so the radar build never sinks over a flaky
 * third-party scrape — MythicSpoiler is a bonus layer on top of Scryfall,
 * never a hard dependency.
 *
 * @param {{ setCodes?: string[], nameToCode?: Map<string, string> | Record<string, string>, todayIso?: string }} [opts]
 * @returns {Promise<{ bySetCode: Record<string, Array<object>>, cardCount: number, fetchedAt: string, ok: boolean }>}
 */
export async function fetchMythicSpoilerSpoilers(opts = {}) {
  const fetchedAt = new Date().toISOString();
  const todayIso = opts.todayIso || fetchedAt.slice(0, 10);
  let cards = [];
  let ok = false;
  try {
    const html = await fetchHtml(NEW_SPOILERS_URL);
    cards = parseNewSpoilers(html, todayIso);
    ok = true;
  } catch (e) {
    console.warn(`  mythicspoiler skipped: ${e.message}`);
  }

  if (opts.nameToCode) {
    cards = remapGenericFolders(cards, opts.nameToCode);
  }

  const extraCodes = [...new Set((opts.setCodes || []).map((c) => String(c).toLowerCase()).filter(Boolean))];
  for (const code of extraCodes) {
    try {
      const html = await fetchHtml(`${BASE}/${code}/index.html`);
      const extra = parseSetGallery(html, code);
      if (extra.length) {
        cards = mergeSpoilerLists(cards, extra);
        console.log(`  mythicspoiler ${code} set page: ${extra.length} cards`);
      }
    } catch (e) {
      console.warn(`  mythicspoiler ${code} set page skipped: ${e.message}`);
    }
  }

  const bySetCode = groupBySet(cards);
  return { bySetCode, cardCount: cards.length, fetchedAt, ok };
}
