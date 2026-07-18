/**
 * Arena-first set radar — Scryfall sets + spoiled cards.
 *
 * Rules:
 *  - No Alchemy (set_type alchemy, Alchemy in name, Y## historic anthologies).
 *  - No tokens / memorabilia / promos / funny / minigame / art series.
 *  - Paper expansion (and similar) only — products that hit Constructed on Arena.
 *  - Arena dates only from overrides when known (never invent without a label).
 *  - Soft estimate (paper − 3 days) is allowed only as confidence:"estimated".
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const API = "https://api.scryfall.com";
const HEADERS = {
  Accept: "application/json",
  "User-Agent": "FilthyNetDeck/pipeline (+https://github.com/L0nE-F0x/Filthy-Net-Deck)",
};

const __dirname = dirname(fileURLToPath(import.meta.url));

/** set_type values we care about for Standard/Pioneer-facing Arena sets */
const ALLOWED_TYPES = new Set(["expansion", "core", "draft_innovation"]);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const MAX_429_RETRIES = 8;

async function scryfallGet(path, attempt = 0) {
  const res = await fetch(`${API}${path}`, { headers: HEADERS });
  if (res.status === 429) {
    if (attempt + 1 >= MAX_429_RETRIES) {
      throw new Error(`Scryfall ${path} → 429 after ${MAX_429_RETRIES} retries`);
    }
    await sleep(Math.min(30_000, 1500 * 2 ** attempt));
    return scryfallGet(path, attempt + 1);
  }
  if (!res.ok) throw new Error(`Scryfall ${path} → ${res.status}`);
  return res.json();
}

function loadOverrides() {
  try {
    const raw = readFileSync(join(__dirname, "set-calendar-overrides.json"), "utf8");
    const data = JSON.parse(raw);
    const out = {};
    for (const [k, v] of Object.entries(data)) {
      if (k.startsWith("_")) continue;
      out[k.toLowerCase()] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** Curated roadmap sets (future-sets.json) — the only hand-maintained input. */
function loadFutureSets() {
  try {
    const raw = readFileSync(join(__dirname, "future-sets.json"), "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data?.sets) ? data.sets : [];
  } catch {
    return [];
  }
}

/**
 * Official WotC YouTube announce trailers (set-trailers.json).
 * Match by Scryfall code and/or exact set name — never invent IDs.
 */
function loadTrailers() {
  try {
    const raw = readFileSync(join(__dirname, "set-trailers.json"), "utf8");
    const data = JSON.parse(raw);
    const byCode = {};
    const byName = {};
    for (const [k, v] of Object.entries(data?.byCode || {})) {
      if (k.startsWith("_") || !v?.youtubeId) continue;
      byCode[k.toLowerCase()] = {
        youtubeId: String(v.youtubeId),
        title: v.title || null,
      };
    }
    for (const [k, v] of Object.entries(data?.byName || {})) {
      if (k.startsWith("_") || !v?.youtubeId) continue;
      byName[normalizeSetName(k)] = {
        youtubeId: String(v.youtubeId),
        title: v.title || null,
      };
    }
    return { byCode, byName };
  } catch {
    return { byCode: {}, byName: {} };
  }
}

function resolveTrailer(trailers, code, name) {
  if (code && trailers.byCode[String(code).toLowerCase()]) {
    return trailers.byCode[String(code).toLowerCase()];
  }
  if (name && trailers.byName[normalizeSetName(name)]) {
    return trailers.byName[normalizeSetName(name)];
  }
  return null;
}

function normalizeSetName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Roadmap-announced sets Scryfall hasn't cataloged yet (e.g. next year's
 * Standard sets revealed at a preview panel). Curated in future-sets.json —
 * every entry carries a source URL, nothing is invented.
 *
 * Self-healing: an entry is dropped the moment Scryfall catalogs the set
 * (normalized name match against the radar window), and exact-dated entries
 * are dropped once their date has passed (stale curation can't linger).
 *
 * @param {Array<{name:string}>} radarSets sets already on the Scryfall radar
 * @param {string} today YYYY-MM-DD
 */
function buildFutureSets(radarSets, today, trailers) {
  const known = new Set(radarSets.map((s) => normalizeSetName(s.name)));
  return loadFutureSets()
    .filter((f) => f && f.name && f.sourceUrl)
    .filter((f) => !known.has(normalizeSetName(f.name)))
    .filter((f) => {
      const sd = String(f.sortDate || "");
      // Full ISO date in the past → stale curation, drop it.
      return !(sd.length === 10 && sd < today);
    })
    .sort((a, b) => String(a.sortDate || "9999").localeCompare(String(b.sortDate || "9999")))
    .map((f) => {
      const trailer = resolveTrailer(trailers, null, f.name);
      return {
        name: f.name,
        kind: f.kind === "universes-beyond" ? "universes-beyond" : "multiverse",
        sortDate: f.sortDate || null,
        dateLabel: f.dateLabel || null,
        confidence: f.confidence === "official" ? "official" : "reported",
        notes: f.notes || null,
        sourceName: f.sourceName || null,
        sourceUrl: f.sourceUrl,
        ...(trailer ? { trailer } : {}),
      };
    });
}

function isAlchemy(set) {
  if (set.set_type === "alchemy") return true;
  if (set.digital && /alchemy/i.test(set.name || "")) return true;
  if (/^alchemy\b/i.test(set.name || "")) return true;
  // Historic Alchemy anthologies Y24, Y25…
  if (/^y\d{2}$/i.test(set.code || "")) return true;
  if (/^ha\d/i.test(set.code || "")) return true;
  return false;
}

function isConstructedProduct(set) {
  if (!ALLOWED_TYPES.has(set.set_type)) return false;
  if (isAlchemy(set)) return false;
  if (set.digital && set.set_type !== "expansion") return false;
  // Commander-only products are not our focus
  if (/commander/i.test(set.name || "")) return false;
  return true;
}

function addDays(isoDate, delta) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function daysBetween(isoA, isoB) {
  const a = new Date(`${isoA}T12:00:00Z`).getTime();
  const b = new Date(`${isoB}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}

/**
 * @param {string} today YYYY-MM-DD
 */
function computeStatus(set, today) {
  const tabletop = set.dates?.tabletop;
  const arena = set.dates?.arena;
  const spoiled = set.spoiledCount || 0;
  const total = set.cardCount || 0;

  if (arena && arena <= today) return "live_on_arena";
  if (tabletop && tabletop <= today) return "released";
  if (spoiled > 0 && tabletop && tabletop > today) return "spoiling";
  if (total > 0 && spoiled === 0 && tabletop && daysBetween(today, tabletop) > 21) {
    return "announced";
  }
  if (tabletop && tabletop > today) return spoiled > 0 ? "spoiling" : "announced";
  return "announced";
}

function mapCard(c) {
  const face = c.card_faces?.[0];
  const legalities = c.legalities || {};
  const colors = Array.isArray(c.colors)
    ? c.colors
    : Array.isArray(face?.colors)
      ? face.colors
      : Array.isArray(c.color_identity)
        ? c.color_identity
        : [];
  return {
    name: c.name,
    scryfallId: c.id,
    rarity: c.rarity || "common",
    collectorNumber: c.collector_number || "",
    typeLine: c.type_line || face?.type_line || "",
    manaCost: c.mana_cost || face?.mana_cost || "",
    cmc: typeof c.cmc === "number" ? c.cmc : undefined,
    colors,
    oracleText: c.oracle_text || face?.oracle_text || "",
    legalities: {
      standard: legalities.standard || "not_legal",
      pioneer: legalities.pioneer || "not_legal",
    },
    scryfallUri: c.scryfall_uri || null,
  };
}

/**
 * Fetch set cards from Scryfall.
 * @param {string} code
 * @param {{ maxCards?: number, order?: string, dir?: string }} [opts]
 *   maxCards — stop after this many (omit for full gallery). Slim samples use
 *   rarity order so the rail/hero still look good without shipping 300+ cards.
 */
async function fetchAllSetCards(code, opts = {}) {
  const maxCards = typeof opts.maxCards === "number" ? opts.maxCards : Infinity;
  const order = opts.order || "set";
  const dir = opts.dir || "asc";
  const cards = [];
  let path = `/cards/search?q=${encodeURIComponent(`set:${code}`)}&unique=prints&order=${order}&dir=${dir}`;
  try {
    while (path && cards.length < maxCards) {
      await sleep(100);
      let data;
      if (path.startsWith("http")) {
        let attempt = 0;
        for (;;) {
          const res = await fetch(path, { headers: HEADERS });
          if (res.status === 429) {
            attempt++;
            if (attempt >= MAX_429_RETRIES) {
              throw new Error(`Scryfall page → 429 after ${MAX_429_RETRIES} retries`);
            }
            await sleep(Math.min(30_000, 1500 * 2 ** (attempt - 1)));
            continue;
          }
          if (res.status === 404) {
            data = null;
            break;
          }
          if (!res.ok) throw new Error(`Scryfall page → ${res.status}`);
          data = await res.json();
          break;
        }
        if (!data) break;
      } else {
        data = await scryfallGet(path);
      }
      for (const c of data.data || []) {
        cards.push(mapCard(c));
        if (cards.length >= maxCards) break;
      }
      path =
        cards.length < maxCards && data.has_more && data.next_page
          ? data.next_page
          : null;
    }
  } catch (e) {
    if (String(e.message).includes("404")) return cards;
    console.warn(`  gallery ${code}: ${e.message}`);
  }
  return cards;
}

/** Banned cards straight from Scryfall legalities (empty list = no bans). */
async function fetchBannedCards(format) {
  const out = [];
  let path = `/cards/search?q=${encodeURIComponent(`banned:${format}`)}&unique=cards&order=name`;
  try {
    while (path) {
      await sleep(100);
      const data = await scryfallGet(path);
      for (const c of data.data || []) {
        out.push({ name: c.name, scryfallId: c.id, setCode: c.set || null });
      }
      path =
        data.has_more && data.next_page
          ? data.next_page.replace(API, "")
          : null;
    }
  } catch (e) {
    // Scryfall answers 404 for an empty search — that just means "no bans".
    if (String(e.message).includes("404")) return out;
    throw e;
  }
  return out;
}

/** All card names matching a Scryfall search (unique cards, 404 = none). */
async function searchCardNames(query) {
  const out = [];
  let path = `/cards/search?q=${encodeURIComponent(query)}&unique=cards&order=name`;
  try {
    while (path) {
      await sleep(100);
      const data = await scryfallGet(path);
      for (const c of data.data || []) out.push(c.name);
      path =
        data.has_more && data.next_page
          ? data.next_page.replace(API, "")
          : null;
    }
  } catch (e) {
    if (String(e.message).includes("404")) return out;
    throw e;
  }
  return out;
}

/**
 * Which Standard cards leave at the next rotation. A card rotates out only
 * when it is Standard-legal via rotating sets alone — any printing in a
 * staying Standard set keeps it (Scryfall legality is set-based, so bonus
 * sheets that never granted legality can't wrongly save a card).
 *
 * @param {Array<{code:string,name:string,enterDate:string|null,exitDate:string|null,exitRough:string|null}>} stdRotation
 * @param {string} today YYYY-MM-DD
 * @returns {Promise<object|null>} rotation payload or null when undeterminable
 */
async function buildRotationImpact(stdRotation, today) {
  const exact = stdRotation
    .map((s) => s.exitDate)
    .filter((d) => d && d > today)
    .sort();
  let rotating;
  let nextDate = null;
  let roughLabel = null;
  if (exact.length) {
    nextDate = exact[0];
    rotating = stdRotation.filter((s) => s.exitDate === nextDate);
  } else {
    // No exact date published yet — group by the rough label of the
    // earliest-entered set that has one ("Q1 2027" style).
    const withRough = stdRotation
      .filter((s) => s.exitRough)
      .sort((a, b) => String(a.enterDate).localeCompare(String(b.enterDate)));
    if (!withRough.length) return null;
    roughLabel = withRough[0].exitRough;
    rotating = stdRotation.filter((s) => s.exitRough === roughLabel);
  }
  const rotatingCodes = rotating.map((s) => s.code).filter(Boolean);
  const stayingCodes = stdRotation
    .map((s) => s.code)
    .filter((c) => c && !rotatingCodes.includes(c));
  if (!rotatingCodes.length || !stayingCodes.length) return null;

  const inSets = (codes) => codes.map((c) => `e:${c}`).join(" or ");
  const [rotatingNames, stayingNames] = [
    await searchCardNames(`f:standard (${inSets(rotatingCodes)})`),
    await searchCardNames(`f:standard (${inSets(stayingCodes)})`),
  ];
  const staying = new Set(stayingNames.map((n) => n.toLowerCase()));
  const cardNames = [...new Set(rotatingNames.map((n) => n.toLowerCase()))]
    .filter((n) => !staying.has(n))
    .sort();

  return {
    nextDate,
    roughLabel,
    setCodes: rotatingCodes,
    cardNames,
  };
}

const WIS_API = "https://whatsinstandard.com/api/v6/standard.json";

/**
 * Sets currently legal in Standard, with rotation dates, from
 * whatsinstandard.com (community-maintained mirror of WotC's rotation plan).
 */
async function fetchStandardRotation() {
  const res = await fetch(WIS_API, { headers: HEADERS });
  if (!res.ok) throw new Error(`whatsinstandard → ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data?.sets)) throw new Error("whatsinstandard: bad shape");
  if (data.deprecated) console.warn("  whatsinstandard v6 is deprecated — check for v7");
  const now = new Date().toISOString();
  const current = data.sets.filter((s) => {
    const enter = s.enterDate?.exact;
    const exit = s.exitDate?.exact;
    return enter && enter <= now && (!exit || exit > now);
  });
  const sets = current.map((s) => ({
    code: String(s.code || "").toLowerCase(),
    name: s.name,
    enterDate: s.enterDate?.exact ? s.enterDate.exact.slice(0, 10) : null,
    exitDate: s.exitDate?.exact ? s.exitDate.exact.slice(0, 10) : null,
    exitRough: s.exitDate?.rough || null,
  }));
  const banReasons = new Map(
    (Array.isArray(data.bans) ? data.bans : [])
      .filter((b) => b?.cardName)
      .map((b) => [b.cardName.toLowerCase(), b.reason || null]),
  );
  return { sets, banReasons };
}

const PIONEER_SINCE = "2012-10-05"; // Return to Ravnica

/**
 * Format hub payload: current Standard sets + rotation, the Pioneer set
 * pool, and both ban lists. Every entry is sourced (Scryfall legalities,
 * whatsinstandard rotation calendar) — nothing is invented.
 *
 * @param {Array<object>} allScryfallSets raw /sets rows (for icons/dates)
 * @param {string} today YYYY-MM-DD
 */
async function buildFormatHub(allScryfallSets, today) {
  const byCode = new Map(
    allScryfallSets.map((s) => [String(s.code).toLowerCase(), s]),
  );

  const { sets: stdRotation, banReasons } = await fetchStandardRotation();
  const standardSets = stdRotation
    .map((s) => {
      const sf = byCode.get(s.code);
      return {
        ...s,
        name: sf?.name || s.name,
        iconSvg: sf?.icon_svg_uri || null,
        releasedAt: sf?.released_at || s.enterDate,
        cardCount: sf?.card_count || 0,
      };
    })
    .sort((a, b) => String(b.releasedAt).localeCompare(String(a.releasedAt)));

  const pioneerSets = allScryfallSets
    .filter(
      (s) =>
        s.released_at &&
        s.released_at >= PIONEER_SINCE &&
        s.released_at <= today &&
        ALLOWED_TYPES.has(s.set_type) &&
        s.set_type !== "draft_innovation" && // MH-style sets skip Pioneer
        !s.digital &&
        !isAlchemy(s),
    )
    .map((s) => ({
      code: String(s.code).toLowerCase(),
      name: s.name,
      iconSvg: s.icon_svg_uri || null,
      releasedAt: s.released_at,
    }))
    .sort((a, b) => b.releasedAt.localeCompare(a.releasedAt));

  console.log("Format hub: fetching ban lists…");
  const standardBans = (await fetchBannedCards("standard")).map((b) => ({
    ...b,
    reason: banReasons.get(b.name.toLowerCase()) || null,
  }));
  const pioneerBans = await fetchBannedCards("pioneer");

  console.log(
    `  standard ${standardSets.length} sets · ${standardBans.length} bans | pioneer ${pioneerSets.length} sets · ${pioneerBans.length} bans`,
  );

  // Rotation impact — which cards leave Standard next. Fail-soft: the hub
  // ships without it rather than sinking bans/rotation dates with it.
  let rotation = null;
  try {
    rotation = await buildRotationImpact(stdRotation, today);
    if (rotation) {
      console.log(
        `  rotation: ${rotation.setCodes.join(",")} → ${rotation.cardNames.length} cards leave ` +
          `(${rotation.nextDate || rotation.roughLabel || "date TBA"})`,
      );
    }
  } catch (e) {
    console.warn(`  rotation impact skipped: ${e.message}`);
  }

  return {
    standard: { sets: standardSets, bans: standardBans, rotation },
    pioneer: { sinceDate: PIONEER_SINCE, sets: pioneerSets, bans: pioneerBans },
    sources: ["scryfall-legalities", "whatsinstandard-v6"],
  };
}

/**
 * Build the sets radar payload for the app.
 * @returns {Promise<object>}
 */
export async function buildSetsBundle() {
  const today = new Date().toISOString().slice(0, 10);
  const overrides = loadOverrides();
  const trailers = loadTrailers();

  console.log("Sets radar: fetching Scryfall /sets…");
  const list = await scryfallGet("/sets");
  const all = list.data || [];

  // Current Standard codes (Foundations → latest) expand "Recently live" beyond
  // the short spoilers window. Fail-soft: if whatsinstandard is down, keep the
  // recent window only.
  let standardCodes = new Set();
  try {
    const { sets: stdRotation } = await fetchStandardRotation();
    standardCodes = new Set(
      stdRotation.map((s) => String(s.code || "").toLowerCase()).filter(Boolean),
    );
    console.log(
      `  Standard pool (${standardCodes.size}): ${[...standardCodes].join(", ") || "—"}`,
    );
  } catch (e) {
    console.warn(`  Standard pool skipped for radar expand: ${e.message}`);
  }

  // Full galleries for future/spoiling + ~90 days of new releases. Older
  // Standard-legal expansions ship a slim mythic/rare sample so the feed stays
  // downloadable (Marvel alone is already ~half the payload).
  const fullGalleryStart = addDays(today, -90);
  const candidates = all
    .filter(isConstructedProduct)
    .filter((s) => {
      const code = String(s.code).toLowerCase();
      // Undated Scryfall rows = roadmap reveals — always keep.
      if (!s.released_at) return true;
      // Upcoming + recent window (full galleries).
      if (s.released_at >= fullGalleryStart) return true;
      // Still-legal Standard expansions (Foundations through current).
      return standardCodes.has(code);
    })
    .sort((a, b) =>
      String(a.released_at || "9999").localeCompare(String(b.released_at || "9999")),
    );

  console.log(
    `  ${candidates.length} constructed products (recent + Standard pool, no Alchemy)`,
  );

  const sets = [];
  for (const s of candidates) {
    await sleep(120);
    const code = String(s.code).toLowerCase();
    const ov = overrides[code] || {};

    // First-look reveals (panel spoilers) often land on Scryfall as a future
    // set with only 1–4 cards. Those are real preview cards — ship them.
    const tabletop = s.released_at || null;
    let arena = ov.arena || null;
    let arenaConfidence = ov.arena ? "official" : "unknown";
    let spoilerStart = ov.spoilerStart || null;

    // Soft estimate only when no override: common Arena pattern ≈ paper − 3 days
    if (!arena && tabletop && tabletop > today) {
      arena = addDays(tabletop, -3);
      arenaConfidence = "estimated";
    }
    // Past Standard sets with no Arena override: paper date is a fine proxy
    // for "live" once the set has released (Arena usually lands same week).
    if (!arena && tabletop && tabletop <= today) {
      arena = tabletop;
      arenaConfidence = "estimated";
    }

    const isFuture = !tabletop || tabletop > today;
    const isRecent = Boolean(tabletop && tabletop >= fullGalleryStart);
    const fullGallery = isFuture || isRecent;

    const cards = fullGallery
      ? await fetchAllSetCards(code)
      : await fetchAllSetCards(code, { maxCards: 16, order: "rarity", dir: "desc" });

    // spoiledCount: full gallery uses actual pull; slim uses Scryfall card_count
    // so the meter doesn't read "16 / 286" as if only 16 are spoiled.
    const spoiledCount = fullGallery ? cards.length : s.card_count || cards.length;
    const previews = fullGallery
      ? [...cards].reverse().slice(0, 14)
      : cards.slice(0, 14);

    const hero =
      cards.find((c) => c.rarity === "mythic") ||
      cards.find((c) => c.rarity === "rare") ||
      cards[0] ||
      null;

    const entry = {
      code,
      name: s.name,
      setType: s.set_type,
      iconSvg: s.icon_svg_uri || null,
      scryfallUri: s.scryfall_uri || `https://scryfall.com/sets/${code}`,
      cardCount: s.card_count || 0,
      spoiledCount,
      dates: {
        tabletop,
        arena,
        spoilerStart,
        prerelease: tabletop ? addDays(tabletop, -7) : null,
      },
      datesConfidence: {
        tabletop: "scryfall",
        arena: arenaConfidence,
        spoilerStart: spoilerStart ? "override" : "unknown",
        prerelease: tabletop ? "estimated" : "unknown",
      },
      heroScryfallId: hero?.scryfallId || null,
      /** Compact rail */
      previews,
      overrideSource: ov.source || null,
      notes: ov.notes || null,
      status: "announced",
    };
    // Full gallery only when we actually paginated the whole set.
    if (fullGallery) {
      entry.cards = cards;
    }
    const trailer = resolveTrailer(trailers, code, s.name);
    if (trailer) entry.trailer = trailer;
    entry.status = computeStatus(entry, today);
    sets.push(entry);
    const galLabel = fullGallery
      ? `gallery ${cards.length}/${entry.cardCount}`
      : `slim ${cards.length} (Standard pool)`;
    console.log(
      `  ${code} · ${s.name} · ${entry.status} · ${galLabel} · arena ${arena || "—"} (${arenaConfidence})`,
    );
    await sleep(80);
  }

  // Sort: spoiling first, then by nearest Arena (or tabletop) date
  const rank = { spoiling: 0, announced: 1, live_on_arena: 2, released: 3 };
  sets.sort((a, b) => {
    const ra = rank[a.status] ?? 9;
    const rb = rank[b.status] ?? 9;
    if (ra !== rb) return ra - rb;
    const da = a.dates.arena || a.dates.tabletop || "9999";
    const db = b.dates.arena || b.dates.tabletop || "9999";
    return da.localeCompare(db);
  });

  // Format hub — legality / rotation / bans. Failure here must not sink the
  // radar itself: warn and ship `formats: null` (the app hides the hub).
  let formats = null;
  try {
    formats = await buildFormatHub(all, today);
  } catch (e) {
    console.warn(`  format hub skipped: ${e.message}`);
  }

  // Roadmap sets beyond Scryfall's catalog (curated, source-linked).
  const futureSets = buildFutureSets(sets, today, trailers);
  if (futureSets.length) {
    console.log(
      `  future radar: ${futureSets.map((f) => `${f.name} (${f.dateLabel || f.sortDate})`).join(" · ")}`,
    );
  }
  const trailerCount =
    sets.filter((s) => s.trailer).length + futureSets.filter((f) => f.trailer).length;
  if (trailerCount) {
    console.log(`  trailers attached: ${trailerCount}`);
  }

  return {
    generatedAt: new Date().toISOString(),
    date: today,
    version: "1.3.0",
    policy: {
      arenaFirst: true,
      noAlchemy: true,
      formats: "Standard/Pioneer-facing expansions only",
      arenaDates:
        "official overrides when known; otherwise estimated as paper release minus 3 days (labeled)",
      futureSets:
        "roadmap-announced sets from curated, source-linked entries (future-sets.json); dropped automatically once Scryfall catalogs the set",
    },
    sources: [
      "scryfall",
      "set-calendar-overrides",
      "whatsinstandard-v6",
      "future-sets",
      "set-trailers",
    ],
    sets,
    formats,
    futureSets,
  };
}
