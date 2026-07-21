import fs from "fs";

const ver = "2.2.1";
const notes =
  "v2.2.1: A UI polish pass — cleaner, more focused wording and labels across Decks, Sets, and Format Hub.";
const wn = [
  "Cleaner, more focused UI — tidied wording and labels across Decks, Sets, and Format Hub",
];

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
pkg.version = ver;
fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");

fs.writeFileSync(
  "src/version.ts",
  `export const APP_VERSION = "${ver}";
export const APP_NAME = "Filthy Net Deck";
export const APP_SLUG = "filthy-net-deck";

/**
 * Player-facing highlights for THIS version — shown once after an update
 * installs (see WhatsNew in StatusBanners). Update alongside APP_VERSION.
 */
export const WHATS_NEW: string[] = ${JSON.stringify(wn, null, 2)};
`,
);

let cargo = fs.readFileSync("src-tauri/Cargo.toml", "utf8");
cargo = cargo.replace(/^version = "[^"]+"/m, `version = "${ver}"`);
fs.writeFileSync("src-tauri/Cargo.toml", cargo);

const conf = JSON.parse(fs.readFileSync("src-tauri/tauri.conf.json", "utf8"));
conf.version = ver;
fs.writeFileSync("src-tauri/tauri.conf.json", JSON.stringify(conf, null, 2) + "\n");

const soft = {
  version: ver,
  downloadUrl: `https://filthy-net-deck.netlify.app/downloads/Filthy-Net-Deck-Setup-${ver}.exe`,
  notes,
};
fs.writeFileSync("website/version.json", JSON.stringify(soft, null, 2) + "\n");
fs.writeFileSync("public/version.json", JSON.stringify(soft, null, 2) + "\n");

// Marketing keeps the current flagship story ("Copy the opponent's deck"); this
// is a polish patch, so only version strings + the OG cache-bust move to 2.2.1.
let h = fs.readFileSync("website/index.html", "utf8");
// Windows installer → 2.2.1 (mac dmg stays 2.2.0 until the tag CI builds it).
h = h.replace(/Filthy-Net-Deck-Setup-2\.2\.0\.exe/g, "Filthy-Net-Deck-Setup-2.2.1.exe");
h = h.replace(/v2\.2\.0 · Windows installer/g, "v2.2.1 · Windows installer");
h = h.replace(/v2\.2\.0 · NSIS · current user install/g, "v2.2.1 · NSIS · current user install");
h = h.replace(/Standard &amp; Pioneer · v2\.2\.0/g, "Standard &amp; Pioneer · v2.2.1");
h = h.replace(/og-image\.png\?v=2\.2\.0/g, "og-image.png?v=2.2.1");
// Title / social version (headline text unchanged — same flagship feature).
h = h.replace(/Filthy Net Deck v2\.2\.0 — Copy the opponent's deck/g, "Filthy Net Deck v2.2.1 — Copy the opponent's deck");
fs.writeFileSync("website/index.html", h);
console.log("bumped", ver);
