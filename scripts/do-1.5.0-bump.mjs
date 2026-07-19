import fs from "fs";

const ver = "1.5.0";
const notes =
  "v1.5.0 Brew Lab: pure list clinic — compare your Arena main/side to today’s ranked Bo1/Bo3 peers (shape, curve, staples). No AI, no invented cards.";
const wn = [
  "Brew Lab on My Stats deck detail — meta-grounded clinic",
  "Shape vs peers: lands, creatures, instants/sorceries, curve",
  "Staple copy nudges only from real ranked lists (no AI)",
  "Bo3 sideboard staple gaps when peer SB data exists",
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
  "<title>Filthy Net Deck v1.5.0 — Brew Lab</title>",
);
h = h.replace(
  /name="description" content="[^"]*"/,
  'name="description" content="Free MTG Arena companion. v1.5.0 Brew Lab: pure list clinic vs ranked meta peers — no AI. Overlay, share, Soundscape. Windows &amp; macOS."',
);
h = h.replace(
  /property="og:title" content="[^"]*"/,
  'property="og:title" content="Filthy Net Deck v1.5.0 — Brew Lab"',
);
h = h.replace(
  /property="og:description"\s*\r?\n\s*content="[^"]*"/,
  'property="og:description"\n      content="Brew Lab clinics your list against today’s Bo1/Bo3 board — shape, curve, staples. Zero AI. Free Windows &amp; macOS."',
);
h = h.replace(/og-image\.png\?v=[0-9.]+/g, "og-image.png?v=1.5.0");
h = h.replace(
  /property="og:image:alt"\s*\r?\n\s*content="[^"]*"/,
  'property="og:image:alt"\n      content="Filthy Net Deck v1.5.0 — Brew Lab — free for Windows + macOS"',
);
h = h.replace(
  /name="twitter:title" content="[^"]*"/,
  'name="twitter:title" content="Filthy Net Deck v1.5.0 — Brew Lab"',
);
h = h.replace(
  /name="twitter:description"\s*\r?\n\s*content="[^"]*"/,
  'name="twitter:description"\n      content="v1.5.0: Brew Lab — pure meta list clinic, no AI. Free · Windows + macOS."',
);
h = h.replace(
  /name="twitter:image:alt"\s*\r?\n\s*content="[^"]*"/,
  'name="twitter:image:alt"\n      content="Filthy Net Deck v1.5.0 — Brew Lab — free for Windows + macOS"',
);
h = h.replace(/Filthy-Net-Deck-Setup-1\.4\.4\.exe/g, "Filthy-Net-Deck-Setup-1.5.0.exe");
h = h.replace(/v1\.4\.4 · Windows installer/g, "v1.5.0 · Windows installer");
h = h.replace(/v1\.4\.4 · NSIS · current user install/g, "v1.5.0 · NSIS · current user install");
h = h.replace(/Standard &amp; Pioneer · v1\.4\.4/g, "Standard &amp; Pioneer · v1.5.0");
// Keep last dmg until CI
h = h.replace(
  /Filthy-Net-Deck-1\.4\.4-universal\.dmg/g,
  "Filthy-Net-Deck-1.4.4-universal.dmg",
);
h = h.replace(/v1\.4\.4 · universal \.dmg/g, "v1.4.4 · universal .dmg (1.5.0 via tag CI)");
h = h.replace(
  /v1\.4\.4 · Apple silicon \+ Intel/g,
  "v1.4.4 · Apple silicon + Intel (1.5.0 via tag CI)",
);
fs.writeFileSync("website/index.html", h);
console.log("bumped", ver);
