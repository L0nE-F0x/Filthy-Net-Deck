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

/**
 * What Scryfall knows about one set: the grpIds it has already claimed, and an
 * index from card name to its Scryfall identity.
 *
 * Returns null when the set could not be read at all, so the caller can tell
 * "no arena ids" from "no answer" — treating a failed fetch as "Scryfall knows
 * nothing" would publish the whole set as a gap.
 *
 * The `byName` index is the whole reason a gap card can have art. Scryfall HAS
 * these cards — it just has not linked them to an `arena_id` yet — so the very
 * search that proves an id is missing also carries that card's `id` and
 * `type_line`. v3.0.1–v3.0.3 threw both away and concluded "no Scryfall id
 * means no art"; the id was in the response all along.
 */
export async function scryfallArenaIdsForSet(code, tries) {
  const ids = new Set();
  const byName = new Map();
  let url = `${SCRYFALL}/cards/search?q=${encodeURIComponent(`set:${code} game:arena`)}&unique=prints`;
  let pages = 0;
  while (url && pages++ < 10) {
    const res = await getJson(url, tries ? { tries } : undefined);
    if (!res.ok) return null; // no answer — caller must skip this set
    // A 404 means the search matched nothing: Scryfall genuinely has no
    // Arena-legal cards in this set. That is an empty answer, not a failure.
    if (res.data === null) return { ids, byName };
    for (const c of res.data.data || []) {
      if (typeof c?.arena_id === "number") ids.add(c.arena_id);
      if (typeof c?.id !== "string" || !c.id) continue;
      // First printing wins. `unique=prints` returns showcase / borderless /
      // promo variants of the same card too, and any of them would render, but
      // pinning the first keeps the published id stable from run to run instead
      // of flipping art whenever Scryfall reorders a page.
      const whole = c.type_line || c.card_faces?.[0]?.type_line || "";
      // Index the whole card under its own name, then each face under its own —
      // Arena gives an Adventure or a DFC back face its own grpId, and that
      // grpId's type line is the FACE's, not the combined one. Sharing the
      // combined string would file "Burglar's Plot" (a Sorcery — Adventure) as
      // a Creature, because the combined line names both.
      // Faces first, whole card last. First-wins, and the whole card's name
      // keys on its front face too ("A // B" → "a"), so indexing it first would
      // let the combined type line beat the front face's own.
      const faces = [
        ...(c.card_faces || []).map((f) => ({
          name: f?.name,
          typeLine: f?.type_line || whole,
        })),
        { name: c.name, typeLine: whole },
      ];
      for (const f of faces) {
        const key = nameKey(f.name);
        if (key && !byName.has(key)) byName.set(key, { id: c.id, typeLine: f.typeLine });
      }
    }
    url = res.data.has_more ? res.data.next_page : null;
    if (url) await new Promise((r) => setTimeout(r, 120));
  }
  return { ids, byName };
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
    const found = await scryfallArenaIdsForSet(code, tries);
    if (found === null) {
      skipped++;
      log(`  arena-names: ${code} unreadable on Scryfall — keeping existing entries`);
      continue;
    }
    const { ids: known, byName } = found;
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
      // Scryfall's own record for this card, matched by name within this one
      // set. Missing `arena_id` is the only thing Scryfall lacks — it has the
      // art and the oracle type line, which is what turns a named-but-blank row
      // into a real card. Only set when the join actually hit; a miss leaves
      // both absent exactly as before.
      const sf = byName.get(nameKey(name));
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
  if (arted) log(`  arena-names: ${arted} entries carry Scryfall art + type line`);
  if (skipped) {
    log(
      `  arena-names: ${skipped} set(s) unreadable this run — their existing ` +
        `entries were kept rather than dropped`,
    );
  }
  return gap;
}
