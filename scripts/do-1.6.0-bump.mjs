import fs from "fs";

const ver = "1.6.0";
const notes =
  "v1.6.0 The tracker got smarter: opponent-archetype inference (your winrate vs each meta deck, from cards actually seen), Bo3 sideboard analytics + per-deck matchup table, live overlay guess, anonymized diagnostic export. Meta lists now multi-source (real MTGO challenge lists with Goldfish fallback).";
const wn = [
  "Opponents, named: cards they play are matched to today's ranked meta — see your winrate by enemy archetype on Decks and in deck detail",
  "Game analytics on My Stats: Bo3 game-1 vs post-board winrate and a per-deck matchup table",
  "Overlay shows a live guess of the opponent's archetype mid-match",
  "Meta lists upgraded: real MTGO challenge decklists first, Goldfish fallback",
  "Settings → Export diagnostic: anonymized parser-health file (counters only — no names, no matches)",
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

// Soft channel: installer URL stays on the legacy host so older silent_update
// allowlists keep working (dual-host policy).
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
  `<title>Filthy Net Deck v${ver} — know the deck across the table</title>`,
);
h = h.replace(
  /name="description" content="[^"]*"/,
  'name="description" content="Free MTG Arena companion. Daily Standard &amp; Pioneer meta from real MTGO lists, opponent-archetype inference, Bo3 sideboard analytics, overlay. Windows &amp; macOS."',
);
h = h.replace(
  /property="og:title" content="[^"]*"/,
  `property="og:title" content="Filthy Net Deck v${ver} — know the deck across the table"`,
);
h = h.replace(
  /property="og:description"\s*\r?\n\s*content="[^"]*"/,
  'property="og:description"\n      content="The tracker got smarter: your winrate vs each meta archetype, inferred from cards opponents actually play. Bo3 sideboard analytics. Real MTGO lists daily. Free, local, Windows + macOS."',
);
h = h.replace(/og-image\.png\?v=[0-9.]+/g, `og-image.png?v=${ver}`);
h = h.replace(
  /property="og:image:alt"\s*\r?\n\s*content="[^"]*"/,
  `property="og:image:alt"\n      content="Filthy Net Deck v${ver} — opponent archetype inference, free for Windows + macOS"`,
);
h = h.replace(
  /name="twitter:title" content="[^"]*"/,
  `name="twitter:title" content="Filthy Net Deck v${ver} — know the deck across the table"`,
);
h = h.replace(
  /name="twitter:description"\s*\r?\n\s*content="[^"]*"/,
  'name="twitter:description"\n      content="Your winrate vs each meta archetype — inferred locally from cards opponents play. Bo3 sideboard analytics. Free MTG Arena companion."',
);
h = h.replace(
  /name="twitter:image:alt"\s*\r?\n\s*content="[^"]*"/,
  `name="twitter:image:alt"\n      content="Filthy Net Deck v${ver} — opponent archetype inference, free for Windows + macOS"`,
);
// Versioned download filenames (relative paths — work on both hosts)
h = h.replace(/Filthy-Net-Deck-Setup-1\.5\.1\.exe/g, `Filthy-Net-Deck-Setup-${ver}.exe`);
h = h.replace(/Filthy-Net-Deck-1\.5\.1-universal\.dmg/g, `Filthy-Net-Deck-${ver}-universal.dmg`);
h = h.replace(/v1\.5\.1/g, `v${ver}`);
fs.writeFileSync("website/index.html", h);

console.log(`Bumped to ${ver}`);
