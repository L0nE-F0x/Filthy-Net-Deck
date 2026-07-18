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

/** Full set gallery — paginate Scryfall until has_more is false. */
async function fetchAllSetCards(code) {
  const cards = [];
  let path = `/cards/search?q=${encodeURIComponent(`set:${code}`)}&unique=prints&order=set&dir=asc`;
  try {
    while (path) {
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
      for (const c of data.data || []) cards.push(mapCard(c));
      path = data.has_more && data.next_page ? data.next_page : null;
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

  return {
    standard: { sets: standardSets, bans: standardBans },
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

  console.log("Sets radar: fetching Scryfall /sets…");
  const list = await scryfallGet("/sets");
  const all = list.data || [];

  // Window: recently released (60d) + future. Sets Scryfall has announced but
  // not yet dated (released_at null) are upcoming by definition — keep them so
  // roadmap reveals appear the day Scryfall creates the row.
  const windowStart = addDays(today, -60);
  const candidates = all
    .filter((s) => !s.released_at || s.released_at >= windowStart)
    .filter(isConstructedProduct)
    .sort((a, b) =>
      String(a.released_at || "9999").localeCompare(String(b.released_at || "9999")),
    );

  console.log(`  ${candidates.length} constructed products in window (no Alchemy)`);

  const sets = [];
  for (const s of candidates) {
    await sleep(120);
    const code = String(s.code).toLowerCase();
    const ov = overrides[code] || {};

    // First-look reveals (panel spoilers) often land on Scryfall as a future
    // set with only 1–4 cards. Those are real preview cards — ship them.
    // (An earlier version skipped these as "stubs", which hid exactly the
    // freshest announcements.)
    const tabletop = s.released_at || null;
    let arena = ov.arena || null;
    let arenaConfidence = ov.arena ? "official" : "unknown";
    let spoilerStart = ov.spoilerStart || null;

    // Soft estimate only when no override: common Arena pattern ≈ paper − 3 days
    if (!arena && tabletop && tabletop > today) {
      arena = addDays(tabletop, -3);
      arenaConfidence = "estimated";
    }

    const cards = await fetchAllSetCards(code);
    const spoiledCount = cards.length;
    // Newest spoilers first for the compact rail
    const previews = [...cards].reverse().slice(0, 14);

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
      /** Compact rail (newest first) */
      previews,
      /** Full set gallery (collector order) */
      cards,
      overrideSource: ov.source || null,
      notes: ov.notes || null,
      status: "announced",
    };
    entry.status = computeStatus(entry, today);
    sets.push(entry);
    console.log(
      `  ${code} · ${s.name} · ${entry.status} · gallery ${spoiledCount}/${entry.cardCount} · arena ${arena || "—"} (${arenaConfidence})`,
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

  return {
    generatedAt: new Date().toISOString(),
    date: today,
    version: "1.1.0",
    policy: {
      arenaFirst: true,
      noAlchemy: true,
      formats: "Standard/Pioneer-facing expansions only",
      arenaDates:
        "official overrides when known; otherwise estimated as paper release minus 3 days (labeled)",
    },
    sources: ["scryfall", "set-calendar-overrides", "whatsinstandard-v6"],
    sets,
    formats,
  };
}
