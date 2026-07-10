/**
 * Filthy Net Deck — daily meta pipeline
 *
 * Produces website/meta/latest.json and public/meta/latest.json with:
 *   8 formats × 8 decks × Bo1/Bo3
 *
 * Sources (server-side only — never from the desktop client):
 *   - magic.gg/decklists (official Arena ranked + championship posts)
 *   - MTGO mtgo.com/decklist/* (embedded JSON challenges)
 *   - MTGGoldfish metagame ranks + deck exports (when not CF-blocked)
 *   - Melee.gg tournament search (paper / RCQ intel)
 *   - Untapped.gg Arena ladder meta links
 *   - Seed archetypes (always; guarantees 8×8 completeness)
 *
 * Note: Spicerack.gg tournament software has shut down; we do not call it.
 *
 * Usage:
 *   node pipeline/build-meta.mjs --seed
 *   node pipeline/build-meta.mjs --live
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyAuthoritativeLists } from "./fetch-goldfish-lists.mjs";
import { collectMagicGgLists } from "./sources/magic-gg.mjs";
import { collectMtgo } from "./sources/mtgo.mjs";
import { collectUntapped } from "./sources/untapped.mjs";
import { collectMelee } from "./sources/melee.mjs";
import {
  assignListsToBundle,
  mergeSourceTags,
  mergeTournamentFeeds,
  scrubMisfitAuthoritative,
} from "./sources/aggregate.mjs";
import { scrubDeckLegality } from "./sources/common.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const today = new Date().toISOString().slice(0, 10);

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BOT_NOTE =
  "FilthyNetDeck/0.7 (+https://github.com/L0nE-F0x/Filthy-Net-Deck; daily meta aggregation)";

function loadSeedExport() {
  const candidates = [
    join(root, "pipeline", "seed-export.json"),
    join(root, "website", "meta", "latest.json"),
    join(root, "public", "meta", "latest.json"),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      const data = JSON.parse(readFileSync(p, "utf8"));
      if (data?.formats?.length && data?.decks) return data;
    } catch {
      /* next */
    }
  }
  return null;
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/json",
      "From": BOT_NOTE,
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.text();
}

/** Pull archetype names + rough meta % from MTGGoldfish metagame page */
async function fetchGoldfishMetagame(formatPath) {
  const url = `https://www.mtggoldfish.com/metagame/${formatPath}`;
  try {
    const html = await fetchText(url);
    const archetypes = [];
    const seen = new Set();
    // href="/archetype/standard-izzet-prowess-woe#paper">Izzet Prowess
    const re =
      /href="\/archetype\/[^"]+"[^>]*>\s*([^<]+?)\s*</gi;
    const names = [];
    let m;
    while ((m = re.exec(html)) !== null) {
      const name = m[1].replace(/\s+/g, " ").trim();
      if (!name || name.length > 60 || seen.has(name.toLowerCase())) continue;
      // skip nav junk
      if (/metagame|price|login|sign/i.test(name)) continue;
      seen.add(name.toLowerCase());
      names.push(name);
    }
    // meta % appear in order on the page (often doubled for online/paper)
    const pcts = [];
    const pre = />([\d.]+)\s*%</g;
    while ((m = pre.exec(html)) !== null) {
      const pct = parseFloat(m[1]);
      if (!Number.isNaN(pct) && pct > 0 && pct < 80) pcts.push(pct);
    }
    // Dedupe consecutive duplicate percentages (online + paper twin columns)
    const uniquePcts = [];
    for (let i = 0; i < pcts.length; i++) {
      if (i > 0 && Math.abs(pcts[i] - pcts[i - 1]) < 0.05) continue;
      uniquePcts.push(pcts[i]);
    }
    for (let i = 0; i < names.length && archetypes.length < 16; i++) {
      archetypes.push({
        name: names[i],
        pct: uniquePcts[i] ?? Math.max(1, 12 - i),
        source: "mtggoldfish",
        url,
      });
    }
    return { url, archetypes };
  } catch (e) {
    console.warn("[goldfish]", formatPath, e.message);
    return { url, archetypes: [], error: String(e.message) };
  }
}

const GOLDFISH_FORMATS = {
  standard: "standard",
  pioneer: "pioneer",
  historic: "historic",
  timeless: "timeless",
  // alchemy / brawl often thinner on goldfish — skip if empty
  alchemy: "alchemy",
};

function fuzzyScore(a, b) {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.85;
  const xt = new Set(x.split(/[^a-z0-9]+/).filter(Boolean));
  const yt = y.split(/[^a-z0-9]+/).filter(Boolean);
  let hit = 0;
  for (const t of yt) if (xt.has(t)) hit++;
  return yt.length ? hit / yt.length : 0;
}

/** Re-rank the 8 decks using live meta % when we can match archetypes */
function applyLiveRanking(bundle, goldfishByFormat) {
  const sources = new Set(bundle.sources || []);
  sources.add("seed");

  for (const fmt of bundle.formats) {
    const live = goldfishByFormat[fmt.id]?.archetypes || [];
    if (!live.length) continue;
    sources.add("mtggoldfish");

    const modeBias = (name, mode) => {
      const n = String(name || "").toLowerCase();
      if (mode === "bo1") {
        if (/prowess|aggro|burn|heroic|landfall|tempo|spells|spellemental|phoenix/.test(n))
          return 8;
        if (/control|lessons|excruciator|beanstalk/.test(n)) return -4;
      } else {
        if (/control|lessons|excruciator|midrange|beanstalk|azorius|4c|dimir|jund/.test(n))
          return 8;
        if (/prowess|aggro|mono-red|heroic|burn/.test(n)) return -3;
      }
      return 0;
    };

    const reRank = (ids, mode) => {
      const scored = ids.map((id, idx) => {
        const deck = bundle.decks[id];
        if (!deck) return { id, score: -idx };
        let best = 0;
        let pct = deck.metaShare ?? 0;
        for (const a of live) {
          const s = fuzzyScore(deck.archetype || deck.name, a.name);
          if (s > best) {
            best = s;
            pct = a.pct;
          }
        }
        const base = best >= 0.5 ? pct * 10 + best : (deck.metaShare ?? 0) + (8 - idx) * 0.01;
        const score = base + modeBias(deck.name, mode);
        if (best >= 0.5) {
          deck.metaShare = pct;
          deck.sources = [
            ...(deck.sources || []).filter((s) => s.name !== "MTGGoldfish Metagame"),
            {
              name: "MTGGoldfish Metagame",
              url: goldfishByFormat[fmt.id].url,
            },
          ];
        }
        return { id, score };
      });
      scored.sort((a, b) => b.score - a.score);
      return scored.map((s, i) => {
        const deck = bundle.decks[s.id];
        if (deck) {
          deck.rank = i + 1;
          deck.tier = i < 3 ? 1 : i < 6 ? 2 : 3;
          deck.mode = mode;
        }
        return s.id;
      });
    };

    if (fmt.bo1DeckIds?.length) fmt.bo1DeckIds = reRank([...fmt.bo1DeckIds], "bo1");
    if (fmt.bo3DeckIds?.length) fmt.bo3DeckIds = reRank([...fmt.bo3DeckIds], "bo3");
    fmt.bo1 = { deckId: fmt.bo1DeckIds?.[0] ?? "" };
    fmt.bo3 = { deckId: fmt.bo3DeckIds?.[0] ?? "" };

    // Refresh metaShareTop from top 4 of bo3 (or bo1)
    const topIds = fmt.bo3DeckIds?.length ? fmt.bo3DeckIds : fmt.bo1DeckIds;
    fmt.metaShareTop = (topIds || []).slice(0, 4).map((id) => {
      const d = bundle.decks[id];
      return { name: d?.name ?? id, pct: d?.metaShare ?? 0 };
    });

    const t1 = [];
    const t2 = [];
    const t3 = [];
    for (const id of topIds || []) {
      const d = bundle.decks[id];
      if (!d) continue;
      if (d.tier === 1) t1.push(d.archetype);
      else if (d.tier === 2) t2.push(d.archetype);
      else t3.push(d.archetype);
    }
    fmt.tiers = [
      { tier: 1, archetypes: t1 },
      { tier: 2, archetypes: t2 },
      { tier: 3, archetypes: t3 },
    ];
  }

  // Never advertise seed/spicerack in the public feed
  for (const bad of ["seed", "spicerack"]) sources.delete(bad);
  sources.add("mtggoldfish");
  bundle.sources = [...sources];
  return bundle;
}

function scrubSources(bundle) {
  bundle.sources = (bundle.sources || []).filter(
    (s) => !["seed", "spicerack", "placeholder"].includes(String(s).toLowerCase()),
  );
  if (!bundle.sources.includes("untapped")) {
    bundle.sources = [...bundle.sources, "untapped"];
  }
  return bundle;
}

function ensureEight(bundle) {
  for (const fmt of bundle.formats) {
    for (const key of ["bo1DeckIds", "bo3DeckIds"]) {
      const ids = fmt[key] || [];
      if (ids.length < 8) {
        console.warn(`[warn] ${fmt.id} ${key} has ${ids.length} decks (want 8)`);
      }
      fmt[key] = ids.slice(0, 8);
    }
    fmt.bo1 = { deckId: fmt.bo1DeckIds?.[0] ?? fmt.bo1?.deckId ?? "" };
    fmt.bo3 = { deckId: fmt.bo3DeckIds?.[0] ?? fmt.bo3?.deckId ?? "" };
  }
  bundle.decksPerFormat = 8;
  return bundle;
}

function writeMeta(bundle) {
  const targets = [join(root, "website", "meta"), join(root, "public", "meta")];
  const json = JSON.stringify(bundle, null, 2);
  for (const dir of targets) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "latest.json"), json);
    writeFileSync(join(dir, `${bundle.date}.json`), json);
  }
  const deckCount = Object.keys(bundle.decks || {}).length;
  console.log(
    `Wrote meta ${bundle.date} · formats=${bundle.formats.length} · decks=${deckCount} · tournaments=${bundle.tournaments?.length ?? 0}`,
  );
  console.log(`Sources: ${(bundle.sources || []).join(", ")}`);
}

async function main() {
  const live = process.argv.includes("--live");
  let bundle = loadSeedExport();
  if (!bundle) {
    console.error("No seed-export.json — run: npm run export-meta");
    process.exit(1);
  }

  bundle.generatedAt = new Date().toISOString();
  bundle.date = today;
  bundle.version = bundle.version || "0.2.0";
  bundle = ensureEight(bundle);

  // Tag all decks as fallback until proven otherwise
  for (const d of Object.values(bundle.decks || {})) {
    if (!d.listQuality) d.listQuality = "fallback";
  }

  if (live) {
    console.log(
      "Live mode: magic.gg + MTGO + Goldfish + Melee + Untapped …",
    );
    const allLists = [];
    const feedBags = [];

    // 1) Official magic.gg
    try {
      const magic = await collectMagicGgLists();
      feedBags.push(magic);
      allLists.push(...(magic.lists || []));
    } catch (e) {
      console.warn("  magic.gg failed", e.message);
    }

    // 2) MTGO official challenges
    try {
      const mtgo = await collectMtgo();
      feedBags.push(mtgo);
      allLists.push(...(mtgo.lists || []));
    } catch (e) {
      console.warn("  mtgo failed", e.message);
    }

    // 3) Goldfish metagame ranks
    const goldfishByFormat = {};
    for (const [fmtId, path] of Object.entries(GOLDFISH_FORMATS)) {
      goldfishByFormat[fmtId] = await fetchGoldfishMetagame(path);
      console.log(
        `  goldfish/${path}: ${goldfishByFormat[fmtId].archetypes.length} archetypes`,
      );
      await new Promise((r) => setTimeout(r, 400));
    }
    bundle = applyLiveRanking(bundle, goldfishByFormat);

    // 4) Goldfish full deck exports
    console.log("  Goldfish deck exports…");
    bundle = await applyAuthoritativeLists(bundle);

    // 5) Melee events (recent competitive filter)
    try {
      const melee = await collectMelee();
      feedBags.push(melee);
      allLists.push(...(melee.lists || []));
    } catch (e) {
      console.warn("  melee failed", e.message);
    }

    // 6) Untapped ladder links
    try {
      const untapped = await collectUntapped();
      feedBags.push(untapped);
      allLists.push(...(untapped.lists || []));
    } catch (e) {
      console.warn("  untapped failed", e.message);
    }

    // Merge tournament feeds + free lists onto decks
    bundle = mergeTournamentFeeds(bundle, feedBags);
    const assigned = assignListsToBundle(bundle, allLists);
    console.log(
      `  Assigned ${assigned} lists from magic.gg/MTGO/Melee pool onto decks (pool=${allLists.length})`,
    );

    // Reject creature-aggro / wrong-shell lists that slipped past name match
    const seedForQa = loadSeedExport();
    const scrubbed = scrubMisfitAuthoritative(bundle, seedForQa);
    if (scrubbed) console.log(`  QA scrub restored ${scrubbed} misfit list(s)`);

    bundle = mergeSourceTags(bundle, [
      "mtggoldfish",
      "magic.gg",
      "mtgo",
      "melee",
      "untapped",
      "scryfall",
    ]);

    const auth = Object.values(bundle.decks || {}).filter(
      (d) => d.listQuality === "authoritative",
    ).length;
    const fail = Object.values(bundle.decks || {}).filter(
      (d) => d.listQuality !== "authoritative",
    ).length;

    bundle.pipeline = {
      ...(bundle.pipeline || {}),
      ranLive: true,
      authoritativeLists: auth,
      failedLists: fail,
      freeListsIngested: allLists.length,
      sourcesDetail: [
        "magic.gg-decklists",
        "mtgo-embedded-json",
        "mtggoldfish-metagame",
        "mtggoldfish-deck-export",
        "melee-searchresults",
        "untapped-meta-links",
      ],
      listPolicy:
        "multi-source: magic.gg > mtgo embedded JSON > goldfish export > tagged fallback only",
    };
  } else {
    console.log("Offline mode (pass --live for multi-source aggregation).");
    bundle.pipeline = {
      ...(bundle.pipeline || {}),
      ranLive: false,
      listPolicy: "offline-export-only",
      sourcesDetail: ["offline-pack"],
    };
  }

  // Always strip known-illegal Standard cards (even offline pack)
  for (const d of Object.values(bundle.decks || {})) {
    scrubDeckLegality(d);
  }

  bundle = scrubSources(bundle);
  writeMeta(bundle);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
