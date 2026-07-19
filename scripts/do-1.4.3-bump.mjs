import fs from "fs";

const ver = "1.4.3";
const notes =
  "v1.4.3: Events drops the old Meta Trackers strip; My Stats deck table sorts by last played (and more) with richer hover tooltips.";
const wn = [
  "Events: Meta Trackers residue removed",
  "My Stats decks: sort by last played, games, record",
  "Richer hover tooltips on stats + events",
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
h = h.replace(/Filthy-Net-Deck-Setup-1\.4\.2\.exe/g, "Filthy-Net-Deck-Setup-1.4.3.exe");
h = h.replace(/v1\.4\.2 · Windows installer/g, "v1.4.3 · Windows installer");
h = h.replace(/v1\.4\.2 · NSIS · current user install/g, "v1.4.3 · NSIS · current user install");
h = h.replace(/Standard &amp; Pioneer · v1\.4\.2/g, "Standard &amp; Pioneer · v1.4.3");
h = h.replace(/og-image\.png\?v=[0-9.]+/g, "og-image.png?v=1.4.3");
h = h.replace(
  /<title>Filthy Net Deck v[^<]+<\/title>/,
  "<title>Filthy Net Deck v1.4.3 — Stats &amp; Events polish</title>",
);
h = h.replace(
  /property="og:title" content="[^"]*"/,
  'property="og:title" content="Filthy Net Deck v1.4.3 — Stats &amp; Events polish"',
);
h = h.replace(
  /name="twitter:title" content="[^"]*"/,
  'name="twitter:title" content="Filthy Net Deck v1.4.3 — Stats &amp; Events polish"',
);
fs.writeFileSync("website/index.html", h);
console.log("bumped", ver);
