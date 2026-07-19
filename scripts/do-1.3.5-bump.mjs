import fs from "fs";

const ver = "1.3.5";
const notes =
  "v1.3.5: In-game overlay, refined — grouped Lands/Creatures/Spells with real art crops, mana pips, clearer draw odds, a true slim collapsed bar, match clock, opacity slider + start-expanded setting, and a Victory/Defeat end flash.";
const wn = [
  "Overlay redesign: grouped sections, real art crops & mana pips",
  "Collapsed bar now shrinks to a true slim strip",
  "New Settings: overlay opacity slider + start-expanded toggle",
  "Victory/Defeat flash, match clock & Bo mode chip",
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

let h = fs.readFileSync("website/index.html", "utf8");
h = h.replace(
  /<title>Filthy Net Deck v[^<]+<\/title>/,
  "<title>Filthy Net Deck v1.3.5 — In-game overlay, refined</title>",
);
h = h.replace(
  /name="description" content="[^"]*"/,
  'name="description" content="Free MTG Arena companion. v1.3.5: overlay glow-up — grouped deck list, real card art, mana pips &amp; draw odds. Windows &amp; macOS. 100% local."',
);
h = h.replace(
  /property="og:title" content="[^"]*"/,
  'property="og:title" content="Filthy Net Deck v1.3.5 — In-game overlay, refined"',
);
h = h.replace(
  /property="og:description"\s*\r?\n\s*content="[^"]*"/,
  'property="og:description"\n      content="Overlay glow-up: grouped Lands/Creatures/Spells with real art crops, mana pips, next-draw odds, true slim bar. Free Windows &amp; macOS. 100% local."',
);
h = h.replace(/og-image\.png\?v=[0-9.]+/g, "og-image.png?v=1.3.5");
h = h.replace(
  /property="og:image:alt"\s*\r?\n\s*content="[^"]*"/,
  'property="og:image:alt"\n      content="Filthy Net Deck v1.3.5 — in-game overlay, refined — free for Windows + macOS"',
);
h = h.replace(
  /name="twitter:title" content="[^"]*"/,
  'name="twitter:title" content="Filthy Net Deck v1.3.5 — In-game overlay, refined"',
);
h = h.replace(
  /name="twitter:description"\s*\r?\n\s*content="[^"]*"/,
  'name="twitter:description"\n      content="v1.3.5: overlay glow-up — grouped list, art crops, mana pips, draw odds. Free · Windows + macOS."',
);
h = h.replace(
  /name="twitter:image:alt"\s*\r?\n\s*content="[^"]*"/,
  'name="twitter:image:alt"\n      content="Filthy Net Deck v1.3.5 — in-game overlay, refined — free for Windows + macOS"',
);
h = h.replace(/Filthy-Net-Deck-Setup-1\.3\.0\.exe/g, "Filthy-Net-Deck-Setup-1.3.5.exe");
h = h.replace(/v1\.3\.0 · Windows installer/g, "v1.3.5 · Windows installer");
h = h.replace(/v1\.3\.0 · NSIS · current user install/g, "v1.3.5 · NSIS · current user install");
h = h.replace(/Standard &amp; Pioneer · v1\.3\.0/g, "Standard &amp; Pioneer · v1.3.5");
fs.writeFileSync("website/index.html", h);

console.log("bumped + website patched", ver);
