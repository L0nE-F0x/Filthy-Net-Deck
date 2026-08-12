/**
 * Arena grpId → card name, for the cards Scryfall cannot resolve yet.
 *
 * ## The gap this closes
 *
 * The app turns an Arena `grpId` into a card name via
 * `https://api.scryfall.com/cards/arena/<grpId>`. That works for everything
 * Scryfall has assigned an `arena_id` to — which is nearly everything, nearly
 * all of the time.
 *
 * The exception is a set in the window between "playable on Arena" and
 * "Scryfall has populated arena_id". Observed 2026-08-12 with **The Hobbit**
 * (`hob`, paper release 08-14): all 193 Scryfall entries carried
 * `games: ["paper","mtgo","arena"]` and `arena_id: null`, so every Hobbit card
 * a player cast showed in the app and the overlay as `Card #103529` — no name,
 * no cost, no colour, and therefore no archetype signal either.
 *
 * That window lands exactly when a new set matters most, and it is the same
 * shape of problem `freshSpoilers` solves on the Sets page: Scryfall is the
 * canonical source and also, briefly, an incomplete one.
 *
 * ## Why mtgajson
 *
 * `mtgajson.untapped.gg` republishes Arena's own card + localisation tables, so
 * it is keyed by `grpid` by construction and has a set the day Arena does. The
 * pipeline already depends on it for `decodeUntappedDeckString`, so this adds a
 * source of truth rather than a dependency.
 *
 * ## Why it is safe to publish colours here
 *
 * Feeding archetype inference a colour from a non-Scryfall source deserves
 * suspicion — the basic-land bug put a phantom Island into an opponent's colour
 * set and reported Rakdos as Grixis. But that bug came from resolving a grpId
 * through a mapping that did not agree with Arena's (`grpId 87457` was a Swamp
 * in the game object and an Island through the card API).
 *
 * This is the opposite situation: mtgajson *is* Arena's card table, keyed by
 * the same `grpid` the log emits, so there is no cross-mapping to disagree.
 * `cmc`, `colorIdentity` and `types` are omitted rather than guessed when Arena
 * does not state them, so "unknown" stays distinguishable from "colourless".
 *
 * ## Why this is self-healing
 *
 * Only grpIds Scryfall **cannot** resolve are emitted, checked per set against
 * live Scryfall data on every run. The moment Scryfall assigns arena_ids the
 * entries disappear, and the file shrinks back to `{}` on its own. Nobody has
 * to remember to remove anything — the same discipline as `freshSpoilers`.
 *
 * Fail-soft: any network problem yields an empty map and the caller keeps the
 * previously published file. This is a fallback for a fallback; it must never
 * be able to fail a build.
 */

const MTGAJSON = "https://mtgajson.untapped.gg/v1/latest";
const SCRYFALL = "https://api.scryfall.com";

/**
 * Arena's colour enum. Verified empirically against the five basic lands in
 * mtgajson rather than assumed — Plains is `[1]`, Island `[2]`, Swamp `[3]`,
 * Mountain `[4]`, Forest `[5]`.
 */
const COLOR_BY_ID = { 1: "W", 2: "U", 3: "B", 4: "R", 5: "G" };

/** Arena's card-type enum: 5 is Land (every basic is `types: [5]`). */
const TYPE_LAND = 5;

/**
 * Arena's casting-cost notation → Scryfall's.
 *
 * Arena prefixes every symbol with `o` and parenthesises hybrids:
 *   `oBoR`             → `{B}{R}`
 *   `o1o(B/R)o(B/R)`   → `{1}{B/R}{B/R}`
 *   `oXo10o(B/P)`      → `{X}{10}{B/P}`
 *
 * Worth converting rather than skipping: the deck list and the overlay draw
 * their colour pips from `manaCost`, not from colour identity, so without this
 * a card would have the right curve position and still no pips.
 *
 * Verified against all 703 distinct cost strings in mtgajson: every atom is
 * either a bare token (`1`, `B`, `X`, `C`, `10`) or a parenthesised hybrid, and
 * none contains a literal `o`, which is what makes the split unambiguous.
 */
export function manaCostFromArena(cc) {
  if (typeof cc !== "string" || !cc) return null;
  const out = [];
  for (const [, atom] of cc.matchAll(/o(\([^)]*\)|[^o]+)/g)) {
    const sym = atom.replace(/[()]/g, "").trim();
    if (sym) out.push(`{${sym}}`);
  }
  return out.length ? out.join("") : null;
}

/** `[3,4]` → `"BR"`, in WUBRG order. Empty string when unknown. */
export function colorsFromIds(ids) {
  if (!Array.isArray(ids)) return "";
  const seen = new Set();
  for (const n of ids) {
    const c = COLOR_BY_ID[n];
    if (c) seen.add(c);
  }
  return ["W", "U", "B", "R", "G"].filter((c) => seen.has(c)).join("");
}

/** Only look at sets this new — the gap only ever exists around release. */
const RECENT_DAYS = 180;

/**
 * `{ ok: true, data }` | `{ ok: true, data: null }` for a real 404 |
 * `{ ok: false }` when the request never got an answer.
 *
 * The three-way result is load-bearing. A 404 from a set search means "Scryfall
 * has no Arena cards here", which is information; a network failure means
 * nothing at all. Collapsing them — the obvious `return null` for both — would
 * make an outage look like "Scryfall knows no arena ids for this set" and
 * publish the entire set as a gap.
 */
async function getJson(url, { tries = 3 } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "FilthyNetDeck/1.0" },
      });
      if (res.ok) return { ok: true, data: await res.json() };
      if (res.status === 404) return { ok: true, data: null };
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250 * (i + 1)));
  }
  return { ok: false };
}

/** Sets released within RECENT_DAYS, or not yet released. Lowercase codes. */
export function recentSetCodes(scryfallSets, now = Date.now()) {
  const cutoff = now - RECENT_DAYS * 24 * 60 * 60 * 1000;
  const out = new Set();
  for (const s of scryfallSets || []) {
    const code = String(s?.code || "").toLowerCase();
    if (!code) continue;
    const t = s?.released_at ? Date.parse(s.released_at) : NaN;
    // No date yet = announced but undated, which is the earliest part of the
    // very window this exists for.
    if (!Number.isFinite(t) || t >= cutoff) out.add(code);
  }
  return out;
}

/**
 * grpIds Scryfall already knows, for one set. Returns null when the set could
 * not be read at all, so the caller can tell "no arena ids" from "no answer" —
 * treating a failed fetch as "Scryfall knows nothing" would publish the whole
 * set as a gap.
 */
export async function scryfallArenaIdsForSet(code) {
  const ids = new Set();
  let url = `${SCRYFALL}/cards/search?q=${encodeURIComponent(`set:${code} game:arena`)}&unique=prints`;
  let pages = 0;
  while (url && pages++ < 10) {
    const res = await getJson(url);
    if (!res.ok) return null; // no answer — caller must skip this set
    // A 404 means the search matched nothing: Scryfall genuinely has no
    // Arena-legal cards in this set. That is an empty answer, not a failure.
    if (res.data === null) return ids;
    for (const c of res.data.data || []) {
      if (typeof c?.arena_id === "number") ids.add(c.arena_id);
    }
    url = res.data.has_more ? res.data.next_page : null;
    if (url) await new Promise((r) => setTimeout(r, 120));
  }
  return ids;
}

/**
 * Build `{ [grpId]: { n, c?, i?, l? } }` for Arena cards Scryfall cannot
 * resolve — name, converted mana cost, colour identity, and land-ness.
 *
 * Self-contained: fetches its own `/sets` list rather than taking one, because
 * the sets bundle does not carry the raw Scryfall payload. Costs one list
 * fetch, the two mtgajson files, and a search per recent set.
 *
 * `opts.sets` injects the set list for tests.
 */
export async function buildArenaNameGap(opts = {}) {
  const log = opts.log ?? (() => {});
  let scryfallSets = opts.sets;
  if (!scryfallSets) {
    const res = await getJson(`${SCRYFALL}/sets`);
    scryfallSets = res.ok && res.data ? res.data.data : null;
    if (!Array.isArray(scryfallSets)) {
      log("  arena-names: Scryfall set list unavailable — publishing nothing");
      return {};
    }
  }
  const [cardsRes, locRes] = await Promise.all([
    getJson(`${MTGAJSON}/cards.json`),
    getJson(`${MTGAJSON}/loc_en.json`),
  ]);
  const cards = cardsRes.ok ? cardsRes.data : null;
  const loc = locRes.ok ? locRes.data : null;
  if (!Array.isArray(cards) || !Array.isArray(loc)) {
    log("  arena-names: mtgajson unavailable — publishing nothing");
    return {};
  }

  const nameByTitle = new Map();
  for (const e of loc) {
    if (e && typeof e.id === "number" && typeof e.text === "string") {
      nameByTitle.set(e.id, e.text);
    }
  }

  const recent = recentSetCodes(scryfallSets);
  const bySet = new Map();
  for (const c of cards) {
    const code = String(c?.set || "").toLowerCase();
    if (!code || !recent.has(code)) continue;
    if (!bySet.has(code)) bySet.set(code, []);
    bySet.get(code).push(c);
  }

  const gap = {};
  for (const [code, rows] of bySet) {
    const known = await scryfallArenaIdsForSet(code);
    if (known === null) {
      log(`  arena-names: ${code} unreadable on Scryfall — skipped`);
      continue;
    }
    let added = 0;
    for (const c of rows) {
      const grp = Number(c?.grpid);
      if (!Number.isFinite(grp) || known.has(grp)) continue;
      const name = nameByTitle.get(c?.titleId);
      if (!name) continue;
      // Compact on purpose — this is fetched by every client that meets an
      // unresolvable card, and it is one entry per card in a whole set.
      //   n = name, c = cmc, i = colour identity, m = mana cost, l = is a land
      // `c` and `i` are omitted when Arena does not state them, so the client
      // can tell "colourless" from "unknown" — the distinction that keeps an
      // unresolved card from pushing an archetype guess.
      const entry = { n: name };
      if (typeof c.cmc === "number" && Number.isFinite(c.cmc)) entry.c = c.cmc;
      const ci = colorsFromIds(c.colorIdentity);
      if (ci) entry.i = ci;
      const mc = manaCostFromArena(c.castingcost);
      if (mc) entry.m = mc;
      if (Array.isArray(c.types) && c.types.includes(TYPE_LAND)) entry.l = 1;
      gap[String(grp)] = entry;
      added++;
    }
    if (added) log(`  arena-names: +${added} from ${code} (Scryfall has no arena_id yet)`);
  }
  return gap;
}
