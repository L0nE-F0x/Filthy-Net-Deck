import fs from "fs";

const ver = "1.7.0";
const notes =
  "v1.7.0 Share the climb: matchup share cards plus save / Discord paste / post on X. Overlay shows your historical WR vs the inferred opponent. Guided first-session coach on Daily — progress bar and You're live when your first match lands.";
const wn = [
  "Share matchups, week recap, and climb story — save PNG, copy image for Discord, or post on X with a download link",
  "Overlay matchup line: your historical WR vs the inferred opponent archetype (cards actually seen), when sample is enough",
  "First-session coach on Daily: setup progress and a You're live moment when your first match is recorded",
  "Captions seed the public meta site when a matchup maps to today's ranked list",
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
  `<title>Filthy Net Deck v${ver} — share the climb</title>`,
);
h = h.replace(
  /name="description" content="[^"]*"/,
  'name="description" content="Free MTG Arena companion. Matchup share cards, overlay historical WR, guided first-session coach. Daily Standard &amp; Pioneer meta. Windows &amp; macOS."',
);
h = h.replace(
  /property="og:title" content="[^"]*"/,
  `property="og:title" content="Filthy Net Deck v${ver} — share the climb"`,
);
h = h.replace(
  /property="og:description"\s*\r?\n\s*content="[^"]*"/,
  'property="og:description"\n      content="Share matchups to Discord or X. Overlay shows your historical WR vs the deck across the table. Guided first-session coach. Free, local, Windows + macOS."',
);
h = h.replace(/og-image\.png\?v=[0-9.]+/g, `og-image.png?v=${ver}`);
h = h.replace(
  /property="og:image:alt"\s*\r?\n\s*content="[^"]*"/,
  `property="og:image:alt"\n      content="Filthy Net Deck v${ver} — matchup share, overlay WR, free for Windows + macOS"`,
);
h = h.replace(
  /name="twitter:title" content="[^"]*"/,
  `name="twitter:title" content="Filthy Net Deck v${ver} — share the climb"`,
);
h = h.replace(
  /name="twitter:description"\s*\r?\n\s*content="[^"]*"/,
  'name="twitter:description"\n      content="Matchup share cards, Discord paste, post on X. Overlay historical WR. First-session coach. Free MTG Arena companion."',
);
h = h.replace(
  /name="twitter:image:alt"\s*\r?\n\s*content="[^"]*"/,
  `name="twitter:image:alt"\n      content="Filthy Net Deck v${ver} — matchup share, overlay WR, free for Windows + macOS"`,
);
// Versioned download filenames
h = h.replace(/Filthy-Net-Deck-Setup-1\.6\.0\.exe/g, `Filthy-Net-Deck-Setup-${ver}.exe`);
h = h.replace(/Filthy-Net-Deck-1\.6\.0-universal\.dmg/g, `Filthy-Net-Deck-${ver}-universal.dmg`);
h = h.replace(/v1\.6\.0/g, `v${ver}`);
// Hero minor label "v1.6" if still present after v1.6.0 pass
h = h.replace(/\*\*v1\.6\*\*/g, `**v1.7**`);
h = h.replace(/>v1\.6</g, `>v1.7<`);
h = h.replace(/<strong>v1\.6<\/strong>/g, `<strong>v1.7</strong>`);
fs.writeFileSync("website/index.html", h);

console.log(`Bumped to ${ver}`);
console.log(notes);
