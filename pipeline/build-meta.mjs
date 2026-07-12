/**
 * Filthy Net Deck — daily meta pipeline (v3, Standard + Pioneer pivot)
 *
 * Hard rules:
 *   1. Only real data ships. There is NO seed pack, no invented lists, no
 *      generated matchup content. If live data can't be fetched, the pipeline
 *      ABORTS WITHOUT WRITING so the previously published (real) data stays up.
 *   2. A deck's identity, rank, list, colors, and key cards all come from ONE
 *      source: MTGGoldfish metagame tiles + that archetype's page list.
 *   3. Every card name must validate against Scryfall (canonical name,
 *      per-format legality, scryfall id for exact CDN images).
 *
 * Formats: Standard (featured) and Pioneer. Nothing else.
 *
 * Usage: node pipeline/build-meta.mjs
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildArenaImport, sleep } from "./sources/common.mjs";
import { fetchMetagameTiles, fetchArchetypeDeck } from "./sources/goldfish.mjs";
import { validateDeck } from "./sources/scryfall.mjs";
import { collectMagicGgTournaments } from "./sources/magic-gg.mjs";
import { collectMtgoTournaments } from "./sources/mtgo.mjs";
import { collectMelee } from "./sources/melee.mjs";
import { collectUntapped } from "./sources/untapped.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const today = new Date().toISOString().slice(0, 10);

const FORMAT_DEFS = [
  {
    id: "standard",
    name: "Standard",
    shortLabel: "STD",
    featured: true,
    goldfishPath: "standard",
  },
  {
    id: "pioneer",
    name: "Pioneer",
    shortLabel: "PIO",
    featured: false,
    goldfishPath: "pioneer",
  },
];

const DECKS_PER_FORMAT = 8;
/** Below this many verified decks in a format, the whole run is discarded. */
const MIN_DECKS_PER_FORMAT = 4;

function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Build one format's decks from goldfish tiles. Every deck is fully live and
 * Scryfall-validated or it doesn't ship — there is no fallback.
 */
async function buildFormat(def, diagnostics) {
  const { tiles } = await fetchMetagameTiles(def.goldfishPath);
  console.log(`  [${def.id}] ${tiles.length} archetype tiles`);

  const picked = [];
  const usedSlugs = new Set();

  for (const tile of tiles) {
    if (picked.length >= DECKS_PER_FORMAT) break;
    const dedupeSlug = slugify(tile.name);
    if (usedSlugs.has(dedupeSlug)) continue;
    // "Other" is goldfish's catch-all bucket, not an archetype
    if (/^other$/i.test(tile.name.trim())) continue;

    await sleep(450);
    const list = await fetchArchetypeDeck(tile.slug);
    if (!list) {
      diagnostics.push(`${def.id}/${tile.name}: archetype list unavailable — skipped`);
      continue;
    }

    const scratch = {
      mainboard: list.mainboard.map((c) => ({ ...c })),
      sideboard: list.sideboard.map((c) => ({ ...c })),
    };
    const report = await validateDeck(scratch, def.id, { dropIllegal: true });

    if (report.skipped) {
      diagnostics.push(`${def.id}/${tile.name}: scryfall unreachable — skipped`);
      continue;
    }
    if (report.unknown.length > 2 || report.mainCount < 55) {
      diagnostics.push(
        `${def.id}/${tile.name}: rejected (unknown=${report.unknown.join("|") || "none"}, main=${report.mainCount})`,
      );
      continue;
    }
    if (report.unknown.length || report.illegal.length) {
      diagnostics.push(
        `${def.id}/${tile.name}: cleaned (dropped unknown=${report.unknown.join("|") || "-"}, illegal=${report.illegal.join("|") || "-"})`,
      );
    }

    usedSlugs.add(dedupeSlug);
    picked.push({ tile, list: scratch, deckId: list.deckId });
    console.log(
      `  [${def.id}] ✓ ${tile.name} — ${report.mainCount} cards (goldfish deck #${list.deckId ?? "?"})`,
    );
  }

  // Deck objects: one per mode. Same ranked order (straight meta %) for both
  // modes — Bo1 hides the sideboard, that's the only difference. No invented
  // matchup notes or sideboard guides: those sections stay empty until a real
  // data source exists.
  const decks = [];
  picked.forEach((p, idx) => {
    const slug = slugify(p.tile.name);
    for (const mode of ["bo1", "bo3"]) {
      const sideboard = mode === "bo3" ? p.list.sideboard : [];
      const deck = {
        id: `${def.id}-${mode}-${slug}`,
        name: p.tile.name,
        format: def.id,
        mode,
        rank: idx + 1,
        tier: idx < 3 ? 1 : idx < 6 ? 2 : 3,
        colors: p.tile.colors || [],
        archetype: p.tile.name,
        description: `${p.tile.metaPct ?? "?"}% of tracked ${def.name} decks${p.tile.sampleSize ? ` (${p.tile.sampleSize} lists)` : ""} on MTGGoldfish. Representative current list from the archetype page.`,
        mainboard: p.list.mainboard,
        sideboard,
        matchups: [],
        sideboardGuide: [],
        arenaImport: buildArenaImport({ mainboard: p.list.mainboard, sideboard }),
        sources: [
          ...(p.tile.url ? [{ name: "MTGGoldfish archetype", url: p.tile.url }] : []),
          {
            name: "MTGGoldfish metagame",
            url: `https://www.mtggoldfish.com/metagame/${def.goldfishPath}`,
          },
        ],
        metaShare: p.tile.metaPct,
        keyCards: p.tile.keyCards?.length ? p.tile.keyCards : undefined,
        listQuality: "authoritative",
        listNote: `Live from MTGGoldfish archetype page${p.deckId ? ` (deck #${p.deckId})` : ""} · all card names verified on Scryfall.`,
      };
      decks.push(deck);
    }
  });

  return decks;
}

const KEPT_TOURNAMENT_FORMATS = new Set(["standard", "pioneer"]);

async function collectTournaments() {
  const bags = [];
  for (const [label, fn] of [
    ["magic.gg", collectMagicGgTournaments],
    ["mtgo", collectMtgoTournaments],
    ["melee", collectMelee],
    ["untapped", collectUntapped],
  ]) {
    try {
      bags.push(await fn());
    } catch (e) {
      console.warn(`  ${label} tournaments failed: ${e.message}`);
    }
  }
  const seen = new Set();
  const merged = [];
  for (const bag of bags) {
    for (const t of bag.tournaments || []) {
      if (!t?.id || !t?.url || seen.has(t.id)) continue;
      if (!KEPT_TOURNAMENT_FORMATS.has(String(t.format).toLowerCase())) continue;
      seen.add(t.id);
      merged.push(t);
    }
  }
  return merged.slice(0, 40);
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
}

async function main() {
  const diagnostics = [];
  const decks = {};
  const formats = [];

  for (const def of FORMAT_DEFS) {
    console.log(`\n${def.id}: goldfish metagame + archetype lists…`);
    let built;
    try {
      built = await buildFormat(def, diagnostics);
    } catch (e) {
      console.error(`ABORT: ${def.id} failed entirely (${e.message}). Nothing written.`);
      process.exit(1);
    }

    const pairCount = built.length / 2;
    if (pairCount < MIN_DECKS_PER_FORMAT) {
      console.error(
        `ABORT: ${def.id} produced only ${pairCount} verified decks (< ${MIN_DECKS_PER_FORMAT}). Nothing written — previous published data stays live.`,
      );
      process.exit(1);
    }

    for (const d of built) decks[d.id] = d;

    const bo1DeckIds = built.filter((d) => d.mode === "bo1").map((d) => d.id);
    const bo3DeckIds = built.filter((d) => d.mode === "bo3").map((d) => d.id);
    const topIds = bo3DeckIds;
    const tiers = { 1: [], 2: [], 3: [] };
    for (const id of topIds) {
      const d = decks[id];
      if (d) tiers[d.tier ?? 3].push(d.archetype);
    }

    formats.push({
      id: def.id,
      name: def.name,
      featured: def.featured,
      shortLabel: def.shortLabel,
      bo1DeckIds,
      bo3DeckIds,
      bo1: { deckId: bo1DeckIds[0] ?? "" },
      bo3: { deckId: bo3DeckIds[0] ?? "" },
      tiers: [1, 2, 3].map((n) => ({ tier: n, archetypes: tiers[n] })),
      metaNotes: `Meta % and lists from MTGGoldfish (${today}). Every card name verified via Scryfall. Rank = metagame share.`,
      metaShareTop: topIds.slice(0, 4).map((id) => ({
        name: decks[id]?.name ?? id,
        pct: decks[id]?.metaShare ?? 0,
      })),
    });
  }

  console.log("\nTournament feeds…");
  const tournaments = await collectTournaments();

  const bundle = {
    generatedAt: new Date().toISOString(),
    date: today,
    formats,
    decks,
    tournaments,
    sources: ["mtggoldfish", "scryfall", "magic.gg", "mtgo", "melee", "untapped"],
    version: "0.9.0",
    decksPerFormat: DECKS_PER_FORMAT,
    pipeline: {
      ranLive: true,
      authoritativeLists: Object.keys(decks).length,
      failedLists: 0,
      listPolicy:
        "live-only: goldfish tile + archetype list, scryfall-validated; run aborts rather than shipping anything fabricated",
      sourcesDetail: [
        "mtggoldfish-metagame-tiles",
        "mtggoldfish-archetype-decklists",
        "scryfall-collection-validation",
        "tournament-links: magic.gg, mtgo, melee, untapped",
      ],
      diagnostics: diagnostics.slice(0, 40),
    },
  };

  writeMeta(bundle);
  if (diagnostics.length) {
    console.log("Diagnostics:");
    for (const d of diagnostics) console.log("  - " + d);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
