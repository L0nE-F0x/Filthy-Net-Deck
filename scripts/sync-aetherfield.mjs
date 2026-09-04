/**
 * Vendor Aetherfield's built site into `public/aetherfield/`.
 *
 * Aetherfield (github.com/L0nE-F0x/MTG-Multiverse) is its own repo with its own
 * toolchain — three.js, custom GLSL, a 6 MB generated star catalogue. It is
 * embedded here as a *built* folder rather than as source or a submodule for
 * two reasons:
 *
 *  - Nothing is shared to deduplicate. It has no React, no Tailwind, no
 *    zustand; merging the sources would add a second Vite plugin chain and a
 *    second set of build assumptions to this repo and save zero bytes.
 *  - CI builds this app from a plain `checkout` + `npm ci` + `npm run build`,
 *    in four separate jobs. A submodule would mean fetching and building
 *    three.js in every one of them on every push, to produce a folder that
 *    changes a few times a year — when a new set ships and the catalogue is
 *    regenerated.
 *
 * So `public/aetherfield/` is committed, exactly as Aetherfield itself commits
 * its generated `public/data/`. Refresh it by running this script and
 * committing the result; CI never runs it.
 *
 *   npm run aetherfield                  # build from ../Magic Card Universe
 *   AETHERFIELD_DIR=/path npm run aetherfield
 *   npm run aetherfield -- --no-build    # copy an existing dist/ as-is
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEST = join(ROOT, "public", "aetherfield");
const SOURCE = resolve(
  process.env.AETHERFIELD_DIR ?? join(ROOT, "..", "Magic Card Universe"),
);
const build = !process.argv.includes("--no-build");

function die(message, hint) {
  console.error(`\n  ${message}`);
  if (hint) console.error(`  ${hint}`);
  console.error("");
  process.exit(1);
}

if (!existsSync(SOURCE)) {
  die(
    `No Aetherfield checkout at ${SOURCE}`,
    "Clone github.com/L0nE-F0x/MTG-Multiverse next to this repo, or set AETHERFIELD_DIR.",
  );
}

// Guard against pointing this at the wrong folder and wiping public/aetherfield
// with something unrelated — the copy step is destructive.
const pkgPath = join(SOURCE, "package.json");
const name = existsSync(pkgPath)
  ? JSON.parse(readFileSync(pkgPath, "utf8")).name
  : null;
if (name !== "magic-card-universe") {
  die(
    `${SOURCE} is not the Aetherfield repo (package name: ${name ?? "none"}).`,
    "Expected a checkout whose package.json name is \"magic-card-universe\".",
  );
}

if (build) {
  console.log(`  building Aetherfield in ${SOURCE} …`);
  const run = spawnSync("npm", ["run", "build"], {
    cwd: SOURCE,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (run.status !== 0) die("Aetherfield build failed; nothing was copied.");
}

const dist = join(SOURCE, "dist");
if (!existsSync(dist)) {
  die(`${dist} does not exist.`, "Run without --no-build, or build it there first.");
}

// The star catalogue is the whole point of the embed; without it the page
// boots to "universe-meta.json missing" and the host shows its failure panel.
for (const required of ["index.html", "data/universe.bin", "data/universe-meta.json"]) {
  if (!existsSync(join(dist, required))) {
    die(`${dist} is missing ${required}.`, "Run `npm run data:build` in the Aetherfield repo.");
  }
}

// `base: './'` in Aetherfield's vite config is what makes a subdirectory work.
// An absolute /assets/ path here would resolve against this app's origin and
// collide with this app's own bundle, so fail loudly rather than ship that.
const indexHtml = readFileSync(join(dist, "index.html"), "utf8");
if (/(?:src|href)="\/(?!\/)/.test(indexHtml)) {
  die(
    "Aetherfield's index.html has root-absolute asset URLs.",
    "Its vite.config.ts needs `base: './'` — see the note there.",
  );
}

await rm(DEST, { recursive: true, force: true });
await mkdir(DEST, { recursive: true });
await cp(dist, DEST, { recursive: true });

async function measure(dir) {
  let bytes = 0;
  let files = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = await measure(path);
      bytes += sub.bytes;
      files += sub.files;
    } else {
      bytes += (await stat(path)).size;
      files += 1;
    }
  }
  return { bytes, files };
}

const { bytes, files } = await measure(DEST);
console.log(
  `  public/aetherfield/ ← ${files} files, ${(bytes / 1024 / 1024).toFixed(1)} MB`,
);
console.log("  commit it: CI does not rebuild this.\n");
