/**
 * The Linux self-update artifact: the release binary, signed with the same
 * minisign key as the Windows installer, and its entry in
 * `website/updater/latest.json`.
 *
 * Why a raw binary and not the tarball: for a build that is not a deb/rpm,
 * tauri-plugin-updater's Linux path writes the downloaded file straight over
 * the running executable (after checking its signature). A gzip payload is
 * only accepted when it holds an `.AppImage` entry, which this is not. So the
 * update is the binary itself, ~40 MB, hosted on the GitHub release next to
 * the tarball — never in `website/downloads/`, which is git history.
 *
 * The entry goes under `linux-x86_64-local`, not `linux-x86_64`. Only copies
 * installed by `website/install.sh` (a folder the user owns) look that key up;
 * pacman copies in `/usr/bin` — every Linux install up to 3.9.14 — look up the
 * plain key and so never get offered a file they could not write. See
 * `src-tauri/src/self_update.rs`.
 *
 * Run AFTER `npm run tauri:build -- --no-bundle` and AFTER the Windows entry of
 * latest.json is on this version (the two share `version` and `notes`; a Linux
 * entry under a different version's number would install itself in a loop).
 *
 *   npm run linux:update
 *
 * Key: TAURI_SIGNING_PRIVATE_KEY_PATH (default ~/.tauri/filthy-net-deck.key).
 * Password: TAURI_SIGNING_PRIVATE_KEY_PASSWORD, else
 * ~/.tauri/filthy-net-deck-key-password.txt.
 */
import { createHash, createPublicKey, verify } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
const SLUG = "filthy-net-deck";
const TARGET = "linux-x86_64-local";
const ASSET = `${SLUG}-${VERSION}-x86_64`;
const URL = `https://github.com/L0nE-F0x/Filthy-Net-Deck/releases/download/v${VERSION}/${ASSET}`;

const fail = (msg) => {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
};

const BINARY = join(ROOT, "src-tauri", "target", "release", SLUG);
if (!existsSync(BINARY)) fail(`No binary at ${BINARY}\n  Run: npm run tauri:build -- --no-bundle`);

const latestPath = join(ROOT, "website", "updater", "latest.json");
const latest = JSON.parse(readFileSync(latestPath, "utf8"));
if (latest.version !== VERSION) {
  fail(
    `latest.json is on ${latest.version}, package.json on ${VERSION}.\n` +
      "  Put the Windows entry on this version first — both platforms share `version`.",
  );
}

const outDir = join(ROOT, "dist-linux");
mkdirSync(outDir, { recursive: true });
const artifact = join(outDir, ASSET);
copyFileSync(BINARY, artifact);

const keyPath = process.env.TAURI_SIGNING_PRIVATE_KEY_PATH || join(homedir(), ".tauri", "filthy-net-deck.key");
const pwFile = join(homedir(), ".tauri", "filthy-net-deck-key-password.txt");
const password =
  process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ??
  (existsSync(pwFile) ? readFileSync(pwFile, "utf8").trim() : null);
if (!existsSync(keyPath)) fail(`No signing key at ${keyPath}`);
if (password == null) fail("No key password: set TAURI_SIGNING_PRIVATE_KEY_PASSWORD.");

// The CLI reads these from the environment too; clear the string form so a
// path left in TAURI_SIGNING_PRIVATE_KEY by the Windows recipe is not parsed
// as key material.
const env = { ...process.env, TAURI_SIGNING_PRIVATE_KEY_PASSWORD: password };
delete env.TAURI_SIGNING_PRIVATE_KEY;
delete env.TAURI_SIGNING_PRIVATE_KEY_PATH;
const sign = spawnSync("npx", ["tauri", "signer", "sign", "-f", keyPath, artifact], {
  cwd: ROOT,
  env,
  stdio: ["ignore", "pipe", "pipe"],
  encoding: "utf8",
});
if (sign.status !== 0) fail(`tauri signer failed:\n${sign.stderr || sign.stdout}`);
const sigPath = `${artifact}.sig`;
if (!existsSync(sigPath)) fail(`signer reported success but wrote no ${sigPath}`);
const signature = readFileSync(sigPath, "utf8").trim();

// Verify against the public key the app carries before anything is
// published. A signature the app would reject means a Linux user who clicks
// "Update & restart" gets an error and keeps the old version.
const conf = JSON.parse(readFileSync(join(ROOT, "src-tauri", "tauri.conf.json"), "utf8"));
const lines = (b64) => Buffer.from(b64.trim(), "base64").toString("utf8").split("\n");
const pk = Buffer.from(lines(conf.plugins.updater.pubkey)[1], "base64"); // "Ed" | keyid | key
const sigLines = lines(signature);
const sig = Buffer.from(sigLines[1], "base64"); // alg | keyid | sig
const trusted = sigLines[2].replace(/^trusted comment: /, "");
const globalSig = Buffer.from(sigLines[3], "base64");
const key = createPublicKey({
  key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), pk.subarray(10)]),
  format: "der",
  type: "spki",
});
const keyId = (b) => Buffer.from(b.subarray(2, 10)).reverse().toString("hex").toUpperCase();
const data = readFileSync(artifact);
const message =
  sig.subarray(0, 2).toString() === "ED" ? createHash("blake2b512").update(data).digest() : data;
const fileOk = verify(null, message, key, sig.subarray(10));
const commentOk = verify(null, Buffer.concat([sig.subarray(10), Buffer.from(trusted)]), key, globalSig);
if (keyId(pk) !== keyId(sig) || !fileOk || !commentOk) {
  fail(`signature does NOT verify against the app's public key (${keyId(pk)}) — not writing latest.json`);
}

latest.platforms[TARGET] = { signature, url: URL };
writeFileSync(latestPath, JSON.stringify(latest, null, 2) + "\n");

console.log(`\n  ${artifact}`);
console.log(`  ${data.length.toLocaleString()} bytes, signature verified (key ${keyId(pk)})`);
console.log(`  latest.json → platforms["${TARGET}"] for ${VERSION}`);
console.log(`\n  Upload BOTH to the v${VERSION} release before the site goes live:`);
console.log(`    gh release upload v${VERSION} ${artifact}\n`);
