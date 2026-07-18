import fs from "fs";

const ver = "1.1.1";
const notes =
  "v1.1.1: Themes picker redesign — expands inside the sidebar only (no more overlap with the main view). Dark/Light still stack with every planeswalker skin.";
const whatsNew = [
  "Themes menu stays in the sidebar — no more covering Decks / My Stats",
  "Compact planeswalker list with Dark/Light still on top",
  "Classic · Chandra · Teferi · Liliana · Ajani · Elspeth",
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
export const WHATS_NEW: string[] = ${JSON.stringify(whatsNew, null, 2)};
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

// Light marketing pin for patch
let h = fs.readFileSync("website/index.html", "utf8");
h = h.replace(/Filthy-Net-Deck-Setup-1\.1\.0\.exe/g, `Filthy-Net-Deck-Setup-${ver}.exe`);
h = h.replace(/v1\.1\.0/g, `v${ver}`);
h = h.replace(/og-image\.png\?v=1\.1\.0/g, `og-image.png?v=${ver}`);
// keep v1.1 marketing titles (feature family) — only pin download version strings above
fs.writeFileSync("website/index.html", h);

let py = fs.readFileSync("website/assets/_gen_og.py", "utf8");
py = py.replace(/v1\.1\.0  ·  Windows \+ macOS/, `v${ver}  ·  Windows + macOS`);
fs.writeFileSync("website/assets/_gen_og.py", py);

console.log("bumped", ver);
