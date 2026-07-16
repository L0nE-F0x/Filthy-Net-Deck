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
  "User-Agent": "FilthyNetDeck/0.13 (+https://github.com/L0nE-F0x/Filthy-Net-Deck)",
};

const __dirname = dirname(fileURLToPath(import.meta.url));

/** set_type values we care about for Standard/Pioneer-facing Arena sets */
const ALLOWED_TYPES = new Set(["expansion", "core", "draft_innovation"]);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function scryfallGet(path) {
  const res = await fetch(`${API}${path}`, { headers: HEADERS });
  if (res.status === 429) {
    await sleep(1500);
    return scryfallGet(path);
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

async function fetchSpoiledCards(code, limit = 12) {
  try {
    const q = encodeURIComponent(`set:${code}`);
    const data = await scryfallGet(
      `/cards/search?q=${q}&unique=prints&order=spoiled&dir=desc`,
    );
    const cards = data.data || [];
    return cards.slice(0, limit).map((c) => ({
      name: c.name,
      scryfallId: c.id,
      rarity: c.rarity,
      collectorNumber: c.collector_number,
      typeLine: c.type_line || "",
      manaCost: c.mana_cost || c.card_faces?.[0]?.mana_cost || "",
    }));
  } catch (e) {
    // 404 = no cards spoiled yet
    if (String(e.message).includes("404")) return [];
    console.warn(`  spoilers ${code}: ${e.message}`);
    return [];
  }
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

  // Window: recently released (60d) + future
  const windowStart = addDays(today, -60);
  const candidates = all
    .filter((s) => s.released_at && s.released_at >= windowStart)
    .filter(isConstructedProduct)
    .sort((a, b) => a.released_at.localeCompare(b.released_at));

  console.log(`  ${candidates.length} constructed products in window (no Alchemy)`);

  const sets = [];
  for (const s of candidates) {
    await sleep(120);
    const code = String(s.code).toLowerCase();
    const ov = overrides[code] || {};

    // Skip Scryfall stub rows (1–2 card pre-catalog shells), not early spoiler sets
    const count = s.card_count || 0;
    const isFuture = s.released_at > today;
    if (isFuture && count > 0 && count < 5 && !ov.arena && !ov.spoilerStart) {
      console.log(`  skip stub ${code} · ${s.name} · ${count} cards`);
      continue;
    }
    const tabletop = s.released_at;
    let arena = ov.arena || null;
    let arenaConfidence = ov.arena ? "official" : "unknown";
    let spoilerStart = ov.spoilerStart || null;

    // Soft estimate only when no override: common Arena pattern ≈ paper − 3 days
    if (!arena && tabletop && tabletop > today) {
      arena = addDays(tabletop, -3);
      arenaConfidence = "estimated";
    }

    const previews = await fetchSpoiledCards(code, 14);
    // Prefer search total if present
    let spoiledCount = previews.length;
    try {
      const q = encodeURIComponent(`set:${code}`);
      const page = await scryfallGet(`/cards/search?q=${q}&unique=prints`);
      spoiledCount = typeof page.total_cards === "number" ? page.total_cards : spoiledCount;
    } catch {
      /* keep previews length */
    }

    const hero =
      previews.find((c) => c.rarity === "mythic") ||
      previews.find((c) => c.rarity === "rare") ||
      previews[0] ||
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
      previews,
      overrideSource: ov.source || null,
      notes: ov.notes || null,
      status: "announced",
    };
    entry.status = computeStatus(entry, today);
    sets.push(entry);
    console.log(
      `  ${code} · ${s.name} · ${entry.status} · spoiled ${spoiledCount}/${entry.cardCount} · arena ${arena || "—"} (${arenaConfidence})`,
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

  return {
    generatedAt: new Date().toISOString(),
    date: today,
    version: "1.0.0",
    policy: {
      arenaFirst: true,
      noAlchemy: true,
      formats: "Standard/Pioneer-facing expansions only",
      arenaDates:
        "official overrides when known; otherwise estimated as paper release minus 3 days (labeled)",
    },
    sources: ["scryfall", "set-calendar-overrides"],
    sets,
  };
}
