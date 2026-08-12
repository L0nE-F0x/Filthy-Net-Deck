/**
 * Build Arena-first set radar JSON for the app.
 * Writes:
 *   - website/meta/sets.json + public/meta/sets.json  (slim index)
 *   - website/meta/sets/<code>.json + public/meta/sets/<code>.json  (full galleries)
 *
 * Usage: node pipeline/build-sets.mjs
 * Safe to run independently of the deck meta pipeline.
 */

import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSetsBundle } from "./sources/sets.mjs";
import { splitSetsBundle } from "./slim-sets-feed.mjs";
import { buildArenaNameGap } from "./sources/arena-names.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function writeTree(dir, indexJson, galleries) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "sets.json"), indexJson);
  const galDir = join(dir, "sets");
  if (existsSync(galDir)) {
    rmSync(galDir, { recursive: true, force: true });
  }
  mkdirSync(galDir, { recursive: true });
  for (const [code, payload] of Object.entries(galleries)) {
    const safe = String(code).toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!safe) continue;
    writeFileSync(join(galDir, `${safe}.json`), JSON.stringify(payload));
  }
}

async function main() {
  const bundle = await buildSetsBundle();
  if (!bundle.sets?.length) {
    console.error("ABORT: no sets produced — previous sets.json left untouched.");
    process.exit(1);
  }

  const { index, galleries } = splitSetsBundle(bundle);
  const indexJson = JSON.stringify(index);
  const galleryCount = Object.keys(galleries).length;
  const indexKb = Math.round(Buffer.byteLength(indexJson) / 1024);

  for (const dir of [join(root, "website", "meta"), join(root, "public", "meta")]) {
    writeTree(dir, indexJson, galleries);
  }

  console.log(
    `\nWrote sets.json · ${bundle.sets.length} sets · ${bundle.date}` +
      ` · index ${indexKb}KB · ${galleryCount} lazy galleries` +
      ` → website/meta + public/meta`,
  );

  // Names for Arena cards Scryfall cannot resolve yet (see arena-names.mjs).
  // Written only when non-empty: an empty result is far more likely to mean
  // "mtgajson was unreachable" than "Scryfall caught up on every set at once",
  // and overwriting a good map with {} would silently reopen the very gap this
  // closes. A genuinely-caught-up map is pruned by the next successful run that
  // *does* return entries, or by hand.
  try {
    const gap = await buildArenaNameGap({ log: (m) => console.log(m) });
    const n = Object.keys(gap).length;
    if (n) {
      const json = JSON.stringify(gap);
      for (const dir of [join(root, "website", "meta"), join(root, "public", "meta")]) {
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "arena-names.json"), json);
      }
      console.log(
        `Wrote arena-names.json · ${n} grpIds Scryfall has no arena_id for` +
          ` · ${Math.round(Buffer.byteLength(json) / 1024)}KB`,
      );
    } else {
      console.log("arena-names: nothing to publish — existing file left untouched");
    }
  } catch (e) {
    // Fail-soft by design: this is a fallback for a fallback and must never be
    // able to break the set radar.
    console.log(`arena-names: skipped (${e?.message || e})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
