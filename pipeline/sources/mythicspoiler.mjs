/**
 * MythicSpoiler — freshest visual spoilers, ahead of Scryfall's catalog.
 *
 * Why this exists: Scryfall usually catalogs new cards within hours, but during
 * active spoiler season MythicSpoiler (and other visual-spoiler aggregators)
 * frequently posts a leaked/previewed card image before it hits the Scryfall
 * API. This source scrapes https://mythicspoiler.com/newspoilers.html and hands
 * back per-set card images so the radar can show "just spoiled" cards the very
 * moment they surface — then drop them automatically once Scryfall catches up.
 *
 * We deliberately take only what the page reliably gives us: the set folder code
 * (which matches the Scryfall set code — hob, trk, sos…) and the card slug (the
 * image filename, which normalizes to the same key as a lowercased Scryfall
 * card name). We do NOT trust the slug as an authoritative display name — the
 * card image itself carries the real name; the de-slugged label is a fallback
 * only. Dedup / self-heal against Scryfall is done by the merge step in sets.mjs
 * using normalizeSlug(scryfallName) === slug.
 */

const BASE = "https://mythicspoiler.com";
const NEW_SPOILERS_URL = `${BASE}/newspoilers.html`;
const HEADERS = {
  Accept: "text/html,application/xhtml+xml",
  "User-Agent": "FilthyNetDeck/pipeline (+https://github.com/L0nE-F0x/Filthy-Net-Deck)",
};

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

/**
 * Best-effort display label from a slug. Not authoritative — the card image is
 * the source of truth. We can't recover spaces/commas/apostrophes from a slug,
 * so this is only used as alt text / a search hint and is labeled unverified in
 * the UI.
 */
export function deslugLabel(slug) {
  const s = String(slug || "").trim();
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Parse newspoilers.html into per-set card lists.
 *
 * The page is a flat grid of blocks shaped like:
 *   <div class="grid-card"><a href="hob/cards/azogmoriasruin.html">
 *     <img ... src="hob/cards/azogmoriasruin.jpg"></a> …credit link… </div>
 *
 * A card can appear under more than one date header, so we dedupe by
 * `${code}/${slug}` and keep first-seen order (newest first on the page).
 *
 * @param {string} html
 * @returns {Array<{ code: string, slug: string, name: string, image: string }>}
 */
export function parseNewSpoilers(html) {
  const out = [];
  const seen = new Set();
  // Card image paths are relative: "<code>/cards/<slug>.jpg". Codes are short
  // alnum set folders; slugs are alnum (apostrophes/spaces already stripped).
  const re = /\b([a-z0-9]{2,6})\/cards\/([a-z0-9]+)\.jpg\b/gi;
  let m;
  while ((m = re.exec(html))) {
    const code = m[1].toLowerCase();
    const slug = m[2].toLowerCase();
    if (!slug || slug === "cardname") continue; // template placeholder
    const key = `${code}/${slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      code,
      slug,
      name: deslugLabel(slug),
      image: `${BASE}/${code}/cards/${slug}.jpg`,
    });
  }
  return out;
}

/**
 * Group parsed cards by set code.
 * @param {ReturnType<typeof parseNewSpoilers>} cards
 * @returns {Record<string, Array<{ slug: string, name: string, image: string }>>}
 */
export function groupBySet(cards) {
  const by = {};
  for (const c of cards) {
    (by[c.code] ||= []).push({ slug: c.slug, name: c.name, image: c.image });
  }
  return by;
}

/**
 * Fetch + parse the live MythicSpoiler new-spoilers page.
 *
 * Fail-soft by design: any network/parse error returns an empty result so the
 * radar build never sinks over a flaky third-party scrape — MythicSpoiler is a
 * bonus layer on top of Scryfall, never a hard dependency.
 *
 * @returns {Promise<{ bySetCode: Record<string, Array<object>>, cardCount: number, fetchedAt: string, ok: boolean }>}
 */
export async function fetchMythicSpoilerSpoilers() {
  const fetchedAt = new Date().toISOString();
  try {
    const res = await fetch(NEW_SPOILERS_URL, { headers: HEADERS, redirect: "follow" });
    if (!res.ok) throw new Error(`${NEW_SPOILERS_URL} → ${res.status}`);
    const html = await res.text();
    const cards = parseNewSpoilers(html);
    const bySetCode = groupBySet(cards);
    return { bySetCode, cardCount: cards.length, fetchedAt, ok: true };
  } catch (e) {
    console.warn(`  mythicspoiler skipped: ${e.message}`);
    return { bySetCode: {}, cardCount: 0, fetchedAt, ok: false };
  }
}
