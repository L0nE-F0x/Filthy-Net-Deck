/**
 * Assemble the Linux release tarball that the Arch PKGBUILD sources.
 *
 * `packaging/arch/PKGBUILD` fetches
 * `<release>/v<ver>/filthy-net-deck-<ver>-x86_64.tar.gz` and checksums it, so
 * the AUR package can be a copy of that file rather than a rewrite. That makes
 * the tarball's *layout* a published contract: a top-level
 * `filthy-net-deck-<ver>/` holding the binary, the .desktop file, the Hyprland
 * rules and three icon sizes. `package()` installs exactly those paths.
 *
 * 3.5.0's tarball was assembled by hand. This script exists so the next one is
 * not — and so the sha256 that goes into the PKGBUILD comes from the file that
 * actually gets uploaded, not from a second, separately-built copy.
 *
 * Run AFTER `npm run tauri:build -- --no-bundle`, which produces the binary.
 *
 *   node scripts/build-linux-tarball.mjs [--out <dir>]
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
const SLUG = "filthy-net-deck";

const outFlag = process.argv.indexOf("--out");
const OUT_DIR = outFlag > -1 ? resolve(process.argv[outFlag + 1]) : join(ROOT, "dist-linux");
const TARBALL = join(OUT_DIR, `${SLUG}-${VERSION}-x86_64.tar.gz`);

const BINARY = join(ROOT, "src-tauri", "target", "release", SLUG);
if (!existsSync(BINARY)) {
  console.error(`\n  No binary at ${BINARY}`);
  console.error("  Run: npm run tauri:build -- --no-bundle\n");
  process.exit(1);
}

// The staging directory name IS the top-level path inside the tarball, and
// PKGBUILD's package() reads `${srcdir}/${_pkgname}-${pkgver}`. Getting this
// name wrong produces a tarball that checksums fine and installs nothing.
const stageRoot = await mkdtemp(join(tmpdir(), "fnd-linux-"));
const stage = join(stageRoot, `${SLUG}-${VERSION}`);
await mkdir(stage, { recursive: true });

const FILES = [
  [BINARY, SLUG],
  [join(ROOT, "packaging", "arch", `${SLUG}.desktop`), `${SLUG}.desktop`],
  [join(ROOT, "packaging", "arch", "hypr", `${SLUG}.lua`), `${SLUG}.lua`],
  [join(ROOT, "src-tauri", "icons", "32x32.png"), "icon-32.png"],
  [join(ROOT, "src-tauri", "icons", "64x64.png"), "icon-64.png"],
  [join(ROOT, "src-tauri", "icons", "128x128.png"), "icon-128.png"],
];
for (const [from, to] of FILES) {
  if (!existsSync(from)) {
    console.error(`\n  Missing ${from}\n`);
    process.exit(1);
  }
  await cp(from, join(stage, to));
}

await mkdir(OUT_DIR, { recursive: true });
await rm(TARBALL, { force: true });

// Reproducible-ish: sorted entries, fixed owner. Not bit-identical across
// runs (mtimes differ), which is fine — the checksum is taken after the fact.
const tar = spawnSync(
  "tar",
  ["--sort=name", "--owner=0", "--group=0", "--numeric-owner",
   "-czf", TARBALL, "-C", stageRoot, `${SLUG}-${VERSION}`],
  { stdio: "inherit" },
);
await rm(stageRoot, { recursive: true, force: true });
if (tar.status !== 0) {
  console.error("\n  tar failed\n");
  process.exit(1);
}

const bytes = readFileSync(TARBALL);
const sha256 = createHash("sha256").update(bytes).digest("hex");

// Update the PKGBUILD in place: the version it advertises and the checksum of
// the file that will be uploaded under that version's tag.
const pkgbuildPath = join(ROOT, "packaging", "arch", "PKGBUILD");
let pkgbuild = readFileSync(pkgbuildPath, "utf8");
pkgbuild = pkgbuild.replace(/^pkgver=.*$/m, `pkgver=${VERSION}`);
pkgbuild = pkgbuild.replace(/^pkgrel=.*$/m, "pkgrel=1");
pkgbuild = pkgbuild.replace(/^sha256sums=\('.*'\)$/m, `sha256sums=('${sha256}')`);
writeFileSync(pkgbuildPath, pkgbuild);

console.log(`\n  ${TARBALL}`);
console.log(`  ${bytes.length.toLocaleString()} bytes`);
console.log(`  sha256 ${sha256}`);
console.log(`  PKGBUILD → pkgver=${VERSION} pkgrel=1, sha256sums updated`);
console.log(`\n  Attach the tarball to the v${VERSION} GitHub release, then`);
console.log(`  refresh the site recipe: npm run linux:recipe\n`);
