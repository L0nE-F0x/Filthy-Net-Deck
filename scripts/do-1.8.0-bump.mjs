import fs from "fs";

const ver = "1.8.0";
const notes =
  "v1.8.0 Retention & depth: Daily catch-up strip, season recap notify + share, queue WR, field EV vs the meta, matchup form/play-draw, opponent share cards, meta-mover toasts, richer match-end alerts. CSV gains season + cards-seen. Windows + macOS via website + signed updater.";
const wn = [
  "Catch up on Daily: your recent record, rank path, and meta movers since last open",
  "Season closed? Climb banner + desktop notify — share your climb story in one click",
  "Queue WR table, vs-the-field expected winrate, and form (W/L) on matchups and meta panels",
  "Share any Matchup Lab opponent record to Discord or X; meta-mover toasts when the board shifts",
  "Richer match-end toasts (opponent archetype when cards were seen); CSV exports season + cards seen",
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
  `<title>Filthy Net Deck v${ver} — catch up, climb, share</title>`,
);
h = h.replace(
  /name="description" content="[^"]*"/,
  'name="description" content="Free MTG Arena companion. Daily catch-up, season recap share, queue WR, field EV, matchup form, opponent share cards. Windows &amp; macOS."',
);
h = h.replace(
  /property="og:title" content="[^"]*"/,
  `property="og:title" content="Filthy Net Deck v${ver} — catch up, climb, share"`,
);
h = h.replace(
  /property="og:description"\s*\r?\n\s*content="[^"]*"/,
  'property="og:description"\n      content="Daily catch-up strip, season recap notify, field EV vs the meta, queue WR, share any matchup. Free, local, Windows + macOS."',
);
h = h.replace(/og-image\.png\?v=[0-9.]+/g, `og-image.png?v=${ver}`);
h = h.replace(
  /property="og:image:alt"\s*\r?\n\s*content="[^"]*"/,
  `property="og:image:alt"\n      content="Filthy Net Deck v${ver} — catch up, climb, share. Free Windows + macOS"`,
);
h = h.replace(
  /name="twitter:title" content="[^"]*"/,
  `name="twitter:title" content="Filthy Net Deck v${ver} — catch up, climb, share"`,
);
h = h.replace(
  /name="twitter:description"\s*\r?\n\s*content="[^"]*"/,
  'name="twitter:description"\n      content="Daily catch-up, season recap share, field EV, queue WR, matchup form. Free MTG Arena companion."',
);
h = h.replace(
  /name="twitter:image:alt"\s*\r?\n\s*content="[^"]*"/,
  `name="twitter:image:alt"\n      content="Filthy Net Deck v${ver} — catch up, climb, share. Free Windows + macOS"`,
);
h = h.replace(/Filthy-Net-Deck-Setup-1\.7\.0\.exe/g, `Filthy-Net-Deck-Setup-${ver}.exe`);
h = h.replace(/Filthy-Net-Deck-1\.7\.0-universal\.dmg/g, `Filthy-Net-Deck-${ver}-universal.dmg`);
h = h.replace(/v1\.7\.0/g, `v${ver}`);
h = h.replace(/<strong>v1\.7<\/strong>/g, `<strong>v1.8</strong>`);
fs.writeFileSync("website/index.html", h);

console.log(`Bumped to ${ver}`);
console.log(notes);
