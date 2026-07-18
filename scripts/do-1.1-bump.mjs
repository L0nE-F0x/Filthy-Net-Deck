import fs from "fs";
import { spawnSync } from "child_process";

const ver = "1.1.0";
const notes =
  "v1.1.0: Planeswalker themes — Chandra, Teferi, Liliana, Ajani, and Elspeth accent skins from the sidebar Themes control. Dark and Light modes still stack with every theme. 100% local.";
const whatsNew = [
  "Planeswalker themes — Chandra, Teferi, Liliana, Ajani, Elspeth (sidebar Themes)",
  "Each skin retints the whole app; Dark/Light still work on top",
  "Classic remains the default ink-and-gold look",
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

// marketing
spawnSync(process.execPath, ["scripts/patch-marketing-1.1.mjs"], { stdio: "inherit" });
console.log("1.1.0 bump complete");
