import fs from "fs";

const ver = "1.3.0";
const notes =
  "v1.3.0: In-game overlay deck tracker (mini art, draw odds, land count), resize + edge-snap, quieter HUD, match-end toasts on by default with Settings test notification.";
const wn = [
  "In-game overlay: library tracker with mini art & draw odds",
  "Land count + slim collapsible bar (less invasive)",
  "Resize, edge-snap, and persist overlay position",
  "Match-end toasts default ON + Settings test notification",
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
  "<title>Filthy Net Deck v1.3 — In-game overlay deck tracker</title>",
);
h = h.replace(
  /name="description" content="[^"]*"/,
  'name="description" content="Free MTG Arena companion. v1.3: in-game overlay with mini art, draw odds &amp; land count. Windows &amp; macOS. 100% local."',
);
h = h.replace(
  /property="og:title" content="[^"]*"/,
  'property="og:title" content="Filthy Net Deck v1.3 — In-game overlay"',
);
h = h.replace(
  /property="og:description"\s*\r?\n\s*content="[^"]*"/,
  'property="og:description"\n      content="NEW: in-game overlay — mini card art, draw odds, land count. Slim collapsible HUD. Free Windows &amp; macOS. 100% local."',
);
h = h.replace(/og-image\.png\?v=[0-9.]+/g, "og-image.png?v=1.3.0");
h = h.replace(
  /property="og:image:alt"\s*\r?\n\s*content="[^"]*"/,
  'property="og:image:alt"\n      content="Filthy Net Deck v1.3 — in-game overlay — free for Windows + macOS"',
);
h = h.replace(
  /name="twitter:title" content="[^"]*"/,
  'name="twitter:title" content="Filthy Net Deck v1.3 — In-game overlay"',
);
h = h.replace(
  /name="twitter:description"\s*\r?\n\s*content="[^"]*"/,
  'name="twitter:description"\n      content="v1.3: overlay deck tracker + draw odds + lands. Free · Windows + macOS."',
);
h = h.replace(
  /name="twitter:image:alt"\s*\r?\n\s*content="[^"]*"/,
  'name="twitter:image:alt"\n      content="Filthy Net Deck v1.3 — in-game overlay — free for Windows + macOS"',
);
h = h.replace(/Filthy-Net-Deck-Setup-1\.2\.0\.exe/g, "Filthy-Net-Deck-Setup-1.3.0.exe");
h = h.replace(/v1\.2\.0 · Windows installer/g, "v1.3.0 · Windows installer");
h = h.replace(/v1\.2\.0 · NSIS · current user install/g, "v1.3.0 · NSIS · current user install");
h = h.replace(/Standard &amp; Pioneer · v1\.2\.0/g, "Standard &amp; Pioneer · v1.3.0");
fs.writeFileSync("website/index.html", h);

console.log("bumped + website patched", ver);
