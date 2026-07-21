/**
 * Filthy Net Deck — daily meta pipeline (v3, Standard + Pioneer pivot)
 *
 * Hard rules:
 *   1. Only real data ships. There is NO seed pack, no invented lists, no
 *      generated matchup content. If live data can't be fetched, the pipeline
 *      ABORTS WITHOUT WRITING so the previously published (real) data stays up.
 *   2. Archetype *identity* + rank + meta % come from MTGGoldfish tiles.
 *      *Lists* prefer multi-source assignment (C3): MTGO challenge 60s →
 *      magic.gg structured `<deck-list>` blocks → Goldfish archetype page.
 *      All non-Goldfish candidates must pass listMatch gates + Scryfall.
 *   3. Every card name must validate against Scryfall (canonical name,
 *      per-format legality, scryfall id for exact CDN images).
 *
 * Formats: Standard (featured) and Pioneer. Nothing else.
 *
 * Usage: node pipeline/build-meta.mjs
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildArenaImport, sleep } from "./sources/common.mjs";
import { fetchMetagameTiles, fetchArchetypeDeck } from "./sources/goldfish.mjs";
import { validateDeck } from "./sources/scryfall.mjs";
import {
  collectMagicGgTournaments,
  fetchMagicGgListPool,
} from "./sources/magic-gg.mjs";
import { collectMtgoTournaments, fetchMtgoListPool } from "./sources/mtgo.mjs";
import { pickBestListForTile } from "./sources/listMatch.mjs";
import { collectMelee } from "./sources/melee.mjs";
import {
  collectUntapped,
  fetchStandardBo1Ladder,
  normalizeArchetypeName,
} from "./sources/untapped.mjs";
import { buildMetaSite } from "./build-meta-site.mjs";

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
 * Try a tournament/event list pool (MTGO or magic.gg) for one tile.
 * Returns { chosen, listSource, listMeta } or null.
 */
async function tryTournamentList(
  pool,
  usedKeys,
  tile,
  goldfishList,
  formatId,
  sourceLabel,
  diagnostics,
) {
  const freePool = pool.filter((l) => {
    const key = `${l.sourceUrl}|${l.player}`;
    return !usedKeys.has(key);
  });
  const hit = pickBestListForTile(freePool, tile, goldfishList);
  if (!hit) return null;

  const scratch = {
    mainboard: hit.list.mainboard.map((c) => ({ ...c })),
    sideboard: (hit.list.sideboard || []).map((c) => ({ ...c })),
  };
  const report = await validateDeck(scratch, formatId, { dropIllegal: true });
  if (report.skipped || report.unknown.length > 2 || report.mainCount < 55) {
    diagnostics.push(
      `${formatId}/${tile.name}: ${sourceLabel} candidate rejected (main=${report.mainCount}, unknown=${report.unknown.length})`,
    );
    return null;
  }
  if (report.unknown.length || report.illegal.length) {
    diagnostics.push(
      `${formatId}/${tile.name}: ${sourceLabel} cleaned (unknown=${report.unknown.join("|") || "-"}, illegal=${report.illegal.join("|") || "-"})`,
    );
  }
  usedKeys.add(`${hit.list.sourceUrl}|${hit.list.player}`);
  return {
    chosen: scratch,
    listSource: sourceLabel,
    listMeta: {
      player: hit.list.player,
      eventName: hit.list.eventName,
      sourceUrl: hit.list.sourceUrl,
      matchScore: hit.match.score,
      keyHits: hit.match.keyHits,
    },
  };
}

/**
 * Build one format's decks.
 *
 * Identity / rank / meta %: Goldfish metagame tiles (unchanged).
 * List assignment (C3): MTGO → magic.gg structured lists → Goldfish page.
 * Every shipping list is Scryfall-validated.
 */
async function buildFormat(def, diagnostics) {
  const { tiles } = await fetchMetagameTiles(def.goldfishPath);
  console.log(`  [${def.id}] ${tiles.length} archetype tiles`);

  let mtgoPool = [];
  try {
    mtgoPool = await fetchMtgoListPool(def.id, { maxEvents: 3, maxDecks: 96 });
    console.log(`  [${def.id}] MTGO list pool: ${mtgoPool.length}`);
  } catch (e) {
    diagnostics.push(`${def.id}: MTGO list pool failed (${e.message})`);
    console.warn(`  [${def.id}] MTGO pool failed: ${e.message}`);
  }

  let magicGgPool = [];
  try {
    magicGgPool = await fetchMagicGgListPool(def.id, {
      maxArticles: 3,
      maxLists: 96,
    });
    console.log(`  [${def.id}] magic.gg list pool: ${magicGgPool.length}`);
  } catch (e) {
    diagnostics.push(`${def.id}: magic.gg list pool failed (${e.message})`);
    console.warn(`  [${def.id}] magic.gg pool failed: ${e.message}`);
  }

  const picked = [];
  const usedSlugs = new Set();
  /** Tournament lists already assigned (one list per archetype). */
  const usedTournamentKeys = new Set();

  /**
   * Resolve one tile's Scryfall-validated list (C3 priority:
   * MTGO → magic.gg → Goldfish archetype page). Null = nothing shippable.
   */
  const resolveTileList = async (tile) => {
    await sleep(450);
    let goldfishList = null;
    try {
      goldfishList = await fetchArchetypeDeck(tile.slug);
    } catch (e) {
      diagnostics.push(`${def.id}/${tile.name}: goldfish fetch error (${e.message})`);
    }

    let chosen = null;
    let listSource = "goldfish";
    let listMeta = {};

    const mtgoHit = await tryTournamentList(
      mtgoPool,
      usedTournamentKeys,
      tile,
      goldfishList,
      def.id,
      "mtgo",
      diagnostics,
    );
    if (mtgoHit) {
      chosen = mtgoHit.chosen;
      listSource = mtgoHit.listSource;
      listMeta = mtgoHit.listMeta;
    } else {
      const ggHit = await tryTournamentList(
        magicGgPool,
        usedTournamentKeys,
        tile,
        goldfishList,
        def.id,
        "magic.gg",
        diagnostics,
      );
      if (ggHit) {
        chosen = ggHit.chosen;
        listSource = ggHit.listSource;
        listMeta = ggHit.listMeta;
      }
    }

    if (!chosen && goldfishList) {
      const scratch = {
        mainboard: goldfishList.mainboard.map((c) => ({ ...c })),
        sideboard: goldfishList.sideboard.map((c) => ({ ...c })),
      };
      const report = await validateDeck(scratch, def.id, { dropIllegal: true });

      if (report.skipped) {
        diagnostics.push(`${def.id}/${tile.name}: scryfall unreachable — skipped`);
        return null;
      }
      if (report.unknown.length > 2 || report.mainCount < 55) {
        diagnostics.push(
          `${def.id}/${tile.name}: rejected (unknown=${report.unknown.join("|") || "none"}, main=${report.mainCount})`,
        );
        return null;
      }
      if (report.unknown.length || report.illegal.length) {
        diagnostics.push(
          `${def.id}/${tile.name}: cleaned (dropped unknown=${report.unknown.join("|") || "-"}, illegal=${report.illegal.join("|") || "-"})`,
        );
      }
      chosen = scratch;
      listSource = "goldfish";
      listMeta = { deckId: goldfishList.deckId };
    }

    if (!chosen) {
      diagnostics.push(
        `${def.id}/${tile.name}: no validated list (MTGO+magic.gg+Goldfish) — skipped`,
      );
      return null;
    }

    const mainCount = chosen.mainboard.reduce((n, c) => n + (c.count || 0), 0);
    if (listSource === "mtgo" || listSource === "magic.gg") {
      console.log(
        `  [${def.id}] ✓ ${tile.name} — ${mainCount} cards (${listSource} ${listMeta.eventName} / ${listMeta.player}, score=${listMeta.matchScore?.toFixed?.(1) ?? listMeta.matchScore})`,
      );
    } else {
      console.log(
        `  [${def.id}] ✓ ${tile.name} — ${mainCount} cards (goldfish deck #${listMeta.deckId ?? "?"})`,
      );
    }
    return { tile, list: chosen, listSource, listMeta };
  };

  for (const tile of tiles) {
    if (picked.length >= DECKS_PER_FORMAT) break;
    const dedupeSlug = slugify(tile.name);
    if (usedSlugs.has(dedupeSlug)) continue;
    // "Other" is goldfish's catch-all bucket, not an archetype
    if (/^other$/i.test(tile.name.trim())) continue;
    const p = await resolveTileList(tile);
    if (!p) continue;
    usedSlugs.add(dedupeSlug);
    picked.push(p);
  }

  // —— Real Bo1 board (Standard only): Untapped free ladder analytics ——
  // The Bo1 ladder meta is NOT the tournament meta (v2.0.2 user report:
  // both modes showed the same 8 decks). Ordering, share and winrate come
  // from the actual Bo1 ladder; lists stay Scryfall-verified from the usual
  // sources by archetype-name match. Ladder archetypes with no verifiable
  // list are skipped with a diagnostic — never invented. Any failure falls
  // back to mirroring the Bo3 board (the previous behavior).
  let bo1Picks = null; // [{ row, p }] in ladder-share order
  let bo1Meta = null;
  if (def.id === "standard") {
    let ladder = null;
    try {
      ladder = await fetchStandardBo1Ladder();
      console.log(
        `  [${def.id}] Untapped Bo1 ladder: ${ladder.board.length} archetypes · period ${ladder.periodId} · ${ladder.totalMatches?.toLocaleString?.("en-US") ?? "?"} matches`,
      );
    } catch (e) {
      diagnostics.push(
        `${def.id}: Untapped Bo1 ladder unavailable (${e.message}) — Bo1 board mirrors Bo3 today`,
      );
    }
    if (ladder) {
      // Widen the list-source pool: the ladder meta contains archetypes the
      // tournament top tiles never show (e.g. Mono-White Auras).
      let fullTiles = [];
      try {
        await sleep(450);
        const full = await fetchMetagameTiles(`${def.goldfishPath}/full`);
        fullTiles = full.tiles;
        console.log(`  [${def.id}] full metagame pool: ${fullTiles.length} tiles`);
      } catch (e) {
        diagnostics.push(`${def.id}: full metagame pool failed (${e.message})`);
      }
      const byNorm = new Map();
      for (const t of [...tiles, ...fullTiles]) {
        if (/^other$/i.test(t.name.trim())) continue;
        const k = normalizeArchetypeName(t.name);
        if (!byNorm.has(k)) byNorm.set(k, t);
      }
      const picks = [];
      for (const row of ladder.board) {
        if (picks.length >= DECKS_PER_FORMAT) break;
        const tile = byNorm.get(row.norm);
        if (!tile) {
          diagnostics.push(
            `${def.id}/bo1: no list source for ladder archetype "${row.name}" (${row.sharePct}%) — skipped`,
          );
          continue;
        }
        const slug = slugify(tile.name);
        let p = picked.find((x) => slugify(x.tile.name) === slug);
        if (!p) {
          p = await resolveTileList(tile);
          if (!p) continue;
          usedSlugs.add(slug);
        }
        picks.push({ row, p });
      }
      if (picks.length >= MIN_DECKS_PER_FORMAT) {
        bo1Picks = picks;
        bo1Meta = { url: ladder.url, totalMatches: ladder.totalMatches };
      } else {
        diagnostics.push(
          `${def.id}/bo1: only ${picks.length} ladder archetypes matched a real list — Bo1 board mirrors Bo3 today`,
        );
      }
    }
  }

  // Deck objects, one board per mode. Bo3 rank = Goldfish tournament share
  // (unchanged). Standard Bo1 rank/share/winrate = Untapped ladder when it
  // resolved above; otherwise Bo1 mirrors Bo3. Bo1 always hides the
  // sideboard. No invented matchup notes or sideboard guides: those sections
  // stay empty until a real data source exists.
  const makeDeck = (p, mode, rank, stats) => {
    const slug = slugify(p.tile.name);
    const fromTournament =
      p.listSource === "mtgo" || p.listSource === "magic.gg";
    const sideboard = mode === "bo3" ? p.list.sideboard : [];
    const sources = [
      ...(p.tile.url ? [{ name: "MTGGoldfish archetype", url: p.tile.url }] : []),
      {
        name: "MTGGoldfish metagame",
        url: `https://www.mtggoldfish.com/metagame/${def.goldfishPath}`,
      },
    ];
    if (fromTournament && p.listMeta.sourceUrl) {
      const label =
        p.listSource === "magic.gg"
          ? `magic.gg — ${p.listMeta.eventName || "article"} (${p.listMeta.player || "?"})`
          : `MTGO — ${p.listMeta.eventName || "event"} (${p.listMeta.player || "?"})`;
      sources.unshift({
        name: label,
        url: p.listMeta.sourceUrl,
      });
    }
    if (stats.untappedUrl) {
      sources.unshift({
        name: "Untapped.gg — Standard Bo1 ladder meta",
        url: stats.untappedUrl,
      });
    }
    const listNote = fromTournament
      ? `Live list from ${p.listSource} (${p.listMeta.eventName || "event"}, pilot ${p.listMeta.player || "?"}) matched to Goldfish archetype "${p.tile.name}" · Scryfall-verified.`
      : `Live from MTGGoldfish archetype page${p.listMeta.deckId ? ` (deck #${p.listMeta.deckId})` : ""} · all card names verified on Scryfall.`;

    return {
      id: `${def.id}-${mode}-${slug}`,
      name: p.tile.name,
      format: def.id,
      mode,
      rank,
      tier: rank <= 3 ? 1 : rank <= 6 ? 2 : 3,
      colors: p.tile.colors || [],
      archetype: p.tile.name,
      description: stats.description,
      mainboard: p.list.mainboard,
      sideboard,
      matchups: [],
      sideboardGuide: [],
      arenaImport: buildArenaImport({ mainboard: p.list.mainboard, sideboard }),
      sources,
      metaShare: stats.metaShare,
      keyCards: p.tile.keyCards?.length ? p.tile.keyCards : undefined,
      listQuality: "authoritative",
      listNote,
      listSource: p.listSource,
    };
  };

  /** Tournament-meta stats (Goldfish tile) — Bo3 and the Bo1 fallback. */
  const goldfishStats = (p) => {
    const fromTournament =
      p.listSource === "mtgo" || p.listSource === "magic.gg";
    const description = fromTournament
      ? `${p.tile.metaPct ?? "?"}% of tracked ${def.name} decks${p.tile.sampleSize ? ` (${p.tile.sampleSize} lists)` : ""} on MTGGoldfish. Representative list from recent ${p.listSource} (${p.listMeta.eventName || "event"}).`
      : `${p.tile.metaPct ?? "?"}% of tracked ${def.name} decks${p.tile.sampleSize ? ` (${p.tile.sampleSize} lists)` : ""} on MTGGoldfish. Representative current list from the archetype page.`;
    return { metaShare: p.tile.metaPct, description };
  };

  /** Real Bo1 ladder stats (Untapped) for one board row. */
  const ladderStats = (row) => ({
    metaShare: row.sharePct,
    untappedUrl: bo1Meta?.url,
    description: `${row.sharePct}% of Standard Bo1 ladder matches on Untapped.gg (${row.matches.toLocaleString("en-US")} matches this meta period${row.winratePct != null ? `, ${row.winratePct}% ladder winrate` : ""}). Representative Scryfall-verified list from the usual sources.`,
  });

  const decks = [];
  picked.forEach((p, idx) => decks.push(makeDeck(p, "bo3", idx + 1, goldfishStats(p))));
  if (bo1Picks) {
    bo1Picks.forEach(({ row, p }, idx) =>
      decks.push(makeDeck(p, "bo1", idx + 1, ladderStats(row))),
    );
  } else {
    picked.forEach((p, idx) => decks.push(makeDeck(p, "bo1", idx + 1, goldfishStats(p))));
  }
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

/** Compact meta-share timeline (last ~45 days) for the app chart. */
function updateHistory(bundle) {
  const targets = [join(root, "website", "meta"), join(root, "public", "meta")];
  const historyPath = join(targets[0], "history.json");
  let existing = [];
  if (existsSync(historyPath)) {
    try {
      const raw = JSON.parse(readFileSync(historyPath, "utf8"));
      existing = Array.isArray(raw?.points) ? raw.points : Array.isArray(raw) ? raw : [];
    } catch {
      existing = [];
    }
  }

  const dayRows = [];
  for (const fmt of bundle.formats || []) {
    for (const mode of ["bo1", "bo3"]) {
      const ids = mode === "bo1" ? fmt.bo1DeckIds || [] : fmt.bo3DeckIds || [];
      for (const id of ids) {
        const d = bundle.decks?.[id];
        if (!d) continue;
        dayRows.push({
          date: bundle.date,
          format: fmt.id,
          mode,
          archetype: d.archetype || d.name,
          pct: Number(d.metaShare) || 0,
        });
      }
    }
  }

  // Drop same-day/format/mode rows then append, keep 45 unique dates.
  const modesTouched = new Set(dayRows.map((r) => `${r.format}|${r.mode}`));
  const kept = existing.filter(
    (p) => !(p.date === bundle.date && modesTouched.has(`${p.format}|${p.mode}`)),
  );
  const merged = [...kept, ...dayRows];
  const dates = [...new Set(merged.map((p) => p.date))].sort();
  const maxDays = 45;
  const dropBefore = dates.length > maxDays ? dates[dates.length - maxDays] : null;
  const points = (dropBefore ? merged.filter((p) => p.date >= dropBefore) : merged).sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.format.localeCompare(b.format) ||
      a.mode.localeCompare(b.mode) ||
      String(a.archetype).localeCompare(String(b.archetype)),
  );
  const history = { updated: new Date().toISOString(), points };
  const histJson = JSON.stringify(history);
  for (const dir of targets) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "history.json"), histJson);
  }
  console.log(`  history.json · ${points.length} points · ${dates.length} days`);
}

function writeMeta(bundle) {
  const targets = [join(root, "website", "meta"), join(root, "public", "meta")];
  // Minified latest for CDN size; pretty dated archive for human diffs.
  const latestJson = JSON.stringify(bundle);
  const archiveJson = JSON.stringify(bundle, null, 2);
  for (const dir of targets) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "latest.json"), latestJson);
    writeFileSync(join(dir, `${bundle.date}.json`), archiveJson);
  }
  updateHistory(bundle);
  try {
    buildMetaSite();
  } catch (e) {
    console.warn(`  meta-web generate failed: ${e.message}`);
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

    // Boards can diverge per mode now — gate each mode on its own count.
    const bo1Count = built.filter((d) => d.mode === "bo1").length;
    const bo3Count = built.filter((d) => d.mode === "bo3").length;
    if (Math.min(bo1Count, bo3Count) < MIN_DECKS_PER_FORMAT) {
      console.error(
        `ABORT: ${def.id} produced only bo1=${bo1Count}/bo3=${bo3Count} verified decks (< ${MIN_DECKS_PER_FORMAT}). Nothing written — previous published data stays live.`,
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
      metaNotes: `Bo3 meta % from MTGGoldfish tournament data (${today}); Standard Bo1 board ranked by real Arena ladder play (Untapped.gg) when available, else mirrors Bo3. Lists from MTGO when matched else Goldfish. Every card name verified via Scryfall.`,
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
        "live-only: goldfish tiles for rank; lists MTGO → magic.gg → goldfish; scryfall-validated; aborts rather than fabricating",
      sourcesDetail: [
        "mtggoldfish-metagame-tiles",
        "mtgo-challenge-lists (C3, when matched)",
        "magic.gg-structured-lists (C3, when matched)",
        "mtggoldfish-archetype-decklists (fallback)",
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
