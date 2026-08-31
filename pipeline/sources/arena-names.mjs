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
 * A second, quieter gap: Arena dumps store cosmetics into old sets Scryfall
 * never tags with `arena_id`, and the 180-day window never sees them:
 *
 *  - **ANA** (Scryfall's "Arena New Player Experience", released_at 2018),
 *    while the paintings live in **pana** without an `arena_id`. A June 2026
 *    Green Game Jam basic (grpId 107492–107496) 404s as `Card #107494`.
 *    Hit for real on 2026-08-25.
 *  - **UNF** (Unfinity, 2022). Players use those lands as styles on any
 *    constructed deck. grpId **81181** is an Adam Paquette Swamp;
 *    `/cards/arena/81181` 404s and the overlay shows `Card 81181`. Hit for
 *    real on 2026-09-01. Scryfall's `set:unf game:arena` search 404s too —
 *    the prints are tagged paper/mtgo only — so the builder also indexes
 *    the paper set for art.
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
 * ## Self-healing, but only ever additively
 *
 * The previously published map is merged, never replaced. An entry is dropped
 * only when a set was **read successfully** and Scryfall positively resolves
 * that grpId — so the file still shrinks to `{}` on its own once Scryfall
 * catches up, the same discipline as `freshSpoilers`, without a bad run being
 * able to take names away.
 *
 * That distinction was learned the hard way. The first cut rebuilt the map from
 * scratch each run, and on 2026-08-12 Scryfall rate-limited the job after six
 * of ten sets: the other four came back unreadable, were skipped, and the
 * shrunken result was written over the good file — **deleting 573 working card
 * names, including every Hobbit card the feature existed for.** A guard against
 * writing a *totally* empty map did not help, because the map was not empty,
 * just wrong. Partial failure is the common case with a rate limiter, so it is
 * the case that has to be safe.
 *
 * Fail-soft throughout: any network problem returns the previous map unchanged.
 * This is a fallback for a fallback; it must never fail a build, and it must
 * never regress one either.
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

/** Oracle names of basic lands. Used to sweep old cosmetic printings. */
export const BASIC_LAND_NAMES = new Set([
  "Plains",
  "Island",
  "Swamp",
  "Mountain",
  "Forest",
  "Wastes",
  "Snow-Covered Plains",
  "Snow-Covered Island",
  "Snow-Covered Swamp",
  "Snow-Covered Mountain",
  "Snow-Covered Forest",
]);

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
 * Arena set codes that keep receiving cards even though Scryfall's
 * `released_at` is years old. Store cosmetics (the Green Game Jam basics,
 * full-art lands, etc.) land here for the rest of the client's life.
 *
 * `ana` is the mtgajson code. Scryfall also has a set named `ana` (the 2018
 * New Player Experience) — that is a different pile of cards. The prints
 * we actually want live in `pana`; see SET_ALIASES.
 */
export const EVERGREEN_ARENA_SETS = new Set(["ana", "unf"]);

/**
 * Extra Scryfall set codes to search when indexing one Arena set.
 *
 * Arena's `ANA` is not Scryfall's `ana`. The Game Jam basics are
 * `set:pana` with `arena_id: null`, so a search of `set:ana` alone would
 * either miss them or join every "Plains" to the 2018 NPE Plains.
 */
export const SET_ALIASES = { ana: ["pana"] };

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
async function getJson(url, { tries = 4 } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "FilthyNetDeck/1.0" },
      });
      if (res.ok) return { ok: true, data: await res.json() };
      if (res.status === 404) return { ok: true, data: null };
      // 429/503: back off properly and honour Retry-After. The first cut
      // retried after 250ms, which is no wait at all to a rate limiter, so a
      // throttled run burned all its attempts in under a second and reported
      // the set as unreadable.
      if (res.status === 429 || res.status >= 500) {
        const ra = Number(res.headers.get("retry-after"));
        const wait = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 2000 * 2 ** i;
        await new Promise((r) => setTimeout(r, Math.min(wait, 30_000)));
        continue;
      }
      return { ok: false };
    } catch {
      /* network — retry below */
    }
    await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
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
  // Evergreen Arena cosmetic dumps never age out of Scryfall's set list —
  // ANA's `released_at` stays 2018, UNF's is 2022 — but players still sleeve
  // those lands onto live constructed decks. Always include them, even when
  // the set list we were handed omitted the row.
  for (const code of EVERGREEN_ARENA_SETS) out.add(code);
  return out;
}

/**
 * Join key for matching an Arena card name to a Scryfall one.
 *
 * Arena's localisation table names a double-faced card by its front face
 * ("Bilbo, Retired Burglar"); Scryfall names it with both ("Bilbo, Retired
 * Burglar // Bilbo, Birthday Celebrant"). Keying on the front face makes those
 * two agree, and both sides are indexed so a lookup succeeds either way.
 */
export function nameKey(name) {
  return String(name || "")
    .split("//")[0]
    .trim()
    .toLowerCase();
}

/** Artist join key — basics reprint endlessly; name alone is not unique. */
export function artistKey(artist) {
  return String(artist || "")
    .trim()
    .toLowerCase();
}

/**
 * Scryfall set codes to search for one Arena set code: itself, then aliases.
 * `ana` → `["ana", "pana"]`.
 */
export function setCodesToSearch(code) {
  const c = String(code || "").toLowerCase();
  if (!c) return [];
  return [c, ...(SET_ALIASES[c] || [])];
}

/**
 * Pick the print that should win when two Scryfall rows share a join key.
 *
 * Unlinked (`arena_id` absent) beats linked: the gap is exactly the unlinked
 * print. Then newer `released_at` beats older, so a 2026 Game Jam Plains
 * beats a 2018 pana Plains that Scryfall also never tagged. Ties keep the
 * first row, which is the "do not flip art between runs" rule.
 */
function betterPrint(next, prev) {
  if (!prev) return true;
  if (!!prev.hasArenaId !== !!next.hasArenaId) return !next.hasArenaId;
  if ((next.releasedAt || 0) !== (prev.releasedAt || 0)) {
    return (next.releasedAt || 0) > (prev.releasedAt || 0);
  }
  return false;
}

function remember(map, key, entry) {
  if (!key) return;
  if (betterPrint(entry, map.get(key))) map.set(key, entry);
}

/**
 * Match an Arena card to the Scryfall row that should supply its art.
 *
 * Artist+name first: five "Plains" in pana are five different paintings.
 * Name-only is the fallback for a new set where names are unique (Hobbit).
 * Evergreen promo dumps (`ana`) skip the name fallback — joining "Plains"
 * to the first hit is how a Swamp became an Island in the basic-land bug,
 * and here it would silently show the 2018 NPE Plains on a Game Jam land.
 */
export function joinScryfall(found, name, artist, { artistRequired = false } = {}) {
  const nk = nameKey(name);
  const ak = artistKey(artist);
  if (nk && ak && found?.byArtist) {
    const hit = found.byArtist.get(`${nk}\0${ak}`);
    if (hit) return hit;
  }
  if (artistRequired) return null;
  return (nk && found?.byName?.get(nk)) || null;
}

/**
 * What Scryfall knows about one set: the grpIds it has already claimed, and an
 * index from card name to its Scryfall identity.
 *
 * Returns null when the set could not be read at all, so the caller can tell
 * "no arena ids" from "no answer" — treating a failed fetch as "Scryfall knows
 * nothing" would publish the whole set as a gap.
 *
 * The `byName` / `byArtist` indexes are the whole reason a gap card can have
 * art. Scryfall HAS these cards — it just has not linked them to an
 * `arena_id` yet — so the very search that proves an id is missing also
 * carries that card's `id` and `type_line`. v3.0.1–v3.0.3 threw both away
 * and concluded "no Scryfall id means no art"; the id was in the response
 * all along.
 *
 * `byArtist` is keyed `nameKey + "\\0" + artistKey`. Basic lands reprint
 * under the same name with different paintings; the Game Jam Plains is
 * Daren Bader, the 2018 pana Plains is Donato Giancola, and joining on
 * name alone would show the wrong one.
 */
function indexScryfallCards(rows, { ids, byName, byArtist }) {
  for (const c of rows || []) {
    if (typeof c?.arena_id === "number") ids.add(c.arena_id);
    if (typeof c?.id !== "string" || !c.id) continue;
    const releasedAt = c.released_at ? Date.parse(c.released_at) : NaN;
    const base = {
      id: c.id,
      hasArenaId: typeof c.arena_id === "number",
      releasedAt: Number.isFinite(releasedAt) ? releasedAt : 0,
    };
    const artist = artistKey(c.artist);
    const whole = c.type_line || c.card_faces?.[0]?.type_line || "";
    // Index the whole card under its own name, then each face under its own —
    // Arena gives an Adventure or a DFC back face its own grpId, and that
    // grpId's type line is the FACE's, not the combined one. Sharing the
    // combined string would file "Burglar's Plot" (a Sorcery — Adventure) as
    // a Creature, because the combined line names both.
    // Faces first, whole card last. First-wins (via remember's tie), and the
    // whole card's name keys on its front face too ("A // B" → "a"), so
    // indexing it first would let the combined type line beat the front
    // face's own.
    const faces = [
      ...(c.card_faces || []).map((f) => ({
        name: f?.name,
        typeLine: f?.type_line || whole,
      })),
      { name: c.name, typeLine: whole },
    ];
    for (const f of faces) {
      const key = nameKey(f.name);
      if (!key) continue;
      const entry = { ...base, typeLine: f.typeLine };
      remember(byName, key, entry);
      if (artist) remember(byArtist, `${key}\0${artist}`, entry);
    }
  }
}

/**
 * Paginate one Scryfall search into `index`.
 * Returns `"ok"` | `"empty"` | `null` (unreadable).
 */
async function searchScryfallIndex(query, tries, index) {
  let url = `${SCRYFALL}/cards/search?q=${encodeURIComponent(query)}&unique=prints`;
  let pages = 0;
  let sawPage = false;
  while (url && pages++ < 10) {
    const res = await getJson(url, tries ? { tries } : undefined);
    if (!res.ok) return null;
    // A 404 means the search matched nothing. That is an empty answer, not a
    // failure — unless we already indexed a previous page of the same query.
    if (res.data === null) return sawPage ? "ok" : "empty";
    sawPage = true;
    indexScryfallCards(res.data.data || [], index);
    url = res.data.has_more ? res.data.next_page : null;
    if (url) await new Promise((r) => setTimeout(r, 120));
  }
  return sawPage ? "ok" : "empty";
}

export async function scryfallArenaIdsForSet(code, tries) {
  const ids = new Set();
  const byName = new Map();
  const byArtist = new Map();
  const index = { ids, byName, byArtist };

  const arena = await searchScryfallIndex(`set:${code} game:arena`, tries, index);
  if (arena === null) return null; // no answer — caller must skip this set

  // Cosmetic sets (Unfinity lands, some Secret Lair) are on Arena but
  // Scryfall's `game:arena` search 404s because the prints are tagged
  // paper/mtgo only. Retry without the filter so art still joins; ids stay
  // empty, which is what makes them a gap.
  if (ids.size === 0 && byName.size === 0) {
    const paper = await searchScryfallIndex(`set:${code}`, tries, index);
    // A paper-search outage after a clean Arena 404 is not "the set is
    // unreadable": we already know Scryfall has no arena_ids here. Returning
    // empty indexes lets the caller publish names (no art) rather than skip
    // the set and leave "Card 81181" in the overlay.
    if (paper === null) return index;
  }
  return index;
}

/**
 * Same index as `scryfallArenaIdsForSet`, merged across a set and its aliases.
 *
 * The primary code (first in `codes`) is load-bearing: if it is unreadable
 * we return null so the caller skips the set rather than treating a network
 * blip as "Scryfall knows no arena ids here". An alias miss is not fatal —
 * we still prune from the primary's known ids, and art joins against
 * whatever we did read.
 */
export async function scryfallArenaIdsForCodes(codes, tries) {
  const list = [...new Set((codes || []).map((c) => String(c || "").toLowerCase()).filter(Boolean))];
  if (!list.length) return { ids: new Set(), byName: new Map(), byArtist: new Map() };
  const ids = new Set();
  const byName = new Map();
  const byArtist = new Map();
  for (let i = 0; i < list.length; i++) {
    const found = await scryfallArenaIdsForSet(list[i], tries);
    if (found === null) {
      if (i === 0) return null;
      continue;
    }
    for (const id of found.ids) ids.add(id);
    for (const [k, v] of found.byName) remember(byName, k, v);
    for (const [k, v] of found.byArtist) remember(byArtist, k, v);
    if (i + 1 < list.length) await new Promise((r) => setTimeout(r, 120));
  }
  return { ids, byName, byArtist };
}

/**
 * Build `{ [grpId]: { n, c?, i?, m?, l?, s?, t? } }` for Arena cards Scryfall
 * cannot resolve — name, converted mana cost, colour identity, land-ness, and
 * (when the name joins) Scryfall's own card id and type line for art.
 *
 * Self-contained: fetches its own `/sets` list rather than taking one, because
 * the sets bundle does not carry the raw Scryfall payload. Costs one list
 * fetch, the two mtgajson files, and a search per recent set.
 *
 * `opts.sets` injects the set list for tests.
 */
export async function buildArenaNameGap(opts = {}) {
  const log = opts.log ?? (() => {});
  // Every bail-out returns what was already published, never `{}`. Losing an
  // upstream source is not evidence that a card became resolvable.
  const previous = opts.previous ?? {};
  // Tests set this to 1 so the real backoff (up to ~10s) is not waited out.
  const tries = opts.tries;
  const fetchOpts = tries ? { tries } : undefined;
  let scryfallSets = opts.sets;
  if (!scryfallSets) {
    const res = await getJson(`${SCRYFALL}/sets`, fetchOpts);
    scryfallSets = res.ok && res.data ? res.data.data : null;
    if (!Array.isArray(scryfallSets)) {
      log("  arena-names: Scryfall set list unavailable — keeping existing map");
      return { ...previous };
    }
  }
  const [cardsRes, locRes] = await Promise.all([
    getJson(`${MTGAJSON}/cards.json`, fetchOpts),
    getJson(`${MTGAJSON}/loc_en.json`, fetchOpts),
  ]);
  const cards = cardsRes.ok ? cardsRes.data : null;
  const loc = locRes.ok ? locRes.data : null;
  if (!Array.isArray(cards) || !Array.isArray(loc)) {
    log("  arena-names: mtgajson unavailable — keeping existing map");
    return { ...previous };
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
  // Arena ids Scryfall already claims, across every set we successfully
  // read. The basic-land sweep below must not re-insert those.
  const resolvedIds = new Set();

  // Start from what is already published and ADD to it.
  //
  // Replacing wholesale was actively harmful. On 2026-08-12 Scryfall
  // rate-limited the run after six sets; the remaining four came back
  // unreadable, were skipped, and the shrunken map was written over the good
  // one — deleting 573 working card names, including every Hobbit card the
  // feature had been built for. A partial upstream failure must never be able
  // to take names away from users, and "empty result, keep the old file" only
  // guarded the total-failure case.
  //
  // An entry is now removed only when a set was read successfully AND Scryfall
  // positively resolves that grpId. A skipped set is a no-op.
  const gap = { ...(opts.previous ?? {}) };
  let skipped = 0;
  let arted = 0;
  for (const [code, rows] of bySet) {
    const found = await scryfallArenaIdsForCodes(setCodesToSearch(code), tries);
    if (found === null) {
      skipped++;
      log(`  arena-names: ${code} unreadable on Scryfall — keeping existing entries`);
      continue;
    }
    const { ids: known } = found;
    for (const id of known) resolvedIds.add(id);
    // Name-only join is how a Swamp became an Island. Require artist on the
    // evergreen promo dump (ANA) where five "Plains" share a set. UNF has
    // one painting per land type, so a name fallback is safe there.
    const artistRequired = code === "ana";
    // This set was read, so entries for it can be pruned once Scryfall knows
    // them. That is what makes the map self-healing rather than ever-growing.
    for (const c of rows) {
      const grp = Number(c?.grpid);
      if (Number.isFinite(grp) && known.has(grp)) delete gap[String(grp)];
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
      //   s = Scryfall id, t = Scryfall type line
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
      // Scryfall's own record for this card. Missing `arena_id` is the only
      // thing Scryfall lacks — it has the art and the oracle type line.
      // Evergreen promo dumps (ANA) join on name+artist so five "Plains"
      // paintings do not collapse onto the first one; a new set still falls
      // back to name because those names are unique within the set.
      const sf = joinScryfall(found, name, c.artistCredit, { artistRequired });
      if (sf) {
        entry.s = sf.id;
        if (sf.typeLine) entry.t = sf.typeLine;
        arted++;
      }
      gap[String(grp)] = entry;
      added++;
    }
    if (added) log(`  arena-names: +${added} from ${code} (Scryfall has no arena_id yet)`);
    // Breathe between sets. Each set is several paginated searches, and ten
    // sets back to back is what tripped Scryfall's limiter on 2026-08-12.
    await new Promise((r) => setTimeout(r, 400));
  }

  // Basic lands from sets the 180-day window never sees. Players sleeve any
  // printing they own (Unfinity, Jumpstart, Secret Lair, Ixalan, …) onto a
  // Standard list; `/cards/arena/<grpId>` 404s and the overlay shows
  // `Card 81181`. Name + land flag, no name-only art join — that is how a
  // Swamp became an Island. Art still arrives for evergreen sets above.
  let basicsAdded = 0;
  for (const c of cards) {
    const grp = Number(c?.grpid);
    if (!Number.isFinite(grp) || resolvedIds.has(grp)) continue;
    if (gap[String(grp)]) continue;
    const name = nameByTitle.get(c?.titleId);
    if (!name || !BASIC_LAND_NAMES.has(name)) continue;
    if (!Array.isArray(c.types) || !c.types.includes(TYPE_LAND)) continue;
    const entry = { n: name, l: 1 };
    const ci = colorsFromIds(c.colorIdentity);
    if (ci) entry.i = ci;
    gap[String(grp)] = entry;
    basicsAdded++;
  }
  if (basicsAdded) log(`  arena-names: +${basicsAdded} unlinked basic-land printings`);

  if (arted) log(`  arena-names: ${arted} entries carry Scryfall art + type line`);
  if (skipped) {
    log(
      `  arena-names: ${skipped} set(s) unreadable this run — their existing ` +
        `entries were kept rather than dropped`,
    );
  }
  return gap;
}
