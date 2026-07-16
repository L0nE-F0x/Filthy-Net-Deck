/**
 * Build Arena-first set radar JSON for the app.
 * Writes website/meta/sets.json + public/meta/sets.json.
 *
 * Usage: node pipeline/build-sets.mjs
 * Safe to run independently of the deck meta pipeline.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSetsBundle } from "./sources/sets.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

async function main() {
  const bundle = await buildSetsBundle();
  if (!bundle.sets?.length) {
    console.error("ABORT: no sets produced — previous sets.json left untouched.");
    process.exit(1);
  }

  const json = JSON.stringify(bundle, null, 2);
  for (const dir of [join(root, "website", "meta"), join(root, "public", "meta")]) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "sets.json"), json);
  }
  console.log(
    `\nWrote sets.json · ${bundle.sets.length} sets · ${bundle.date} → website/meta + public/meta`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
