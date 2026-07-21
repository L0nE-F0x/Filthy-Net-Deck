import fs from "fs";

const ver = "2.2.0";
const notes =
  "v2.2.0: Copy the opponent's deck. Matchup Lab now reads the cards the tracker saw them play, guesses the closest ranked list, and lets you copy it as an Arena import or send it straight to Brew Lab to improve on — all local, nothing uploaded.";
const wn = [
  "Matchup Lab: a \"What they were playing\" panel guesses the opponent's deck from the cards they revealed — copy the closest ranked list as an Arena import in one click",
  "\"Improve in Brew Lab\" sends that list to the clinic and grades it against today's field",
  "Read from the most recent match or union every card seen across your history vs that opponent",
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

const TITLE = "Filthy Net Deck v2.2.0 — Copy the opponent's deck";
const OG_DESC =
  "Matchup Lab reads the cards your opponent revealed, guesses the closest ranked list, and copies it as an Arena import — then grade it in Brew Lab. Free, local, Windows + macOS.";
const TW_DESC =
  "New in Matchup Lab: guess the opponent's deck from the cards they revealed and copy the closest ranked list to Arena. Free MTG Arena companion for Windows + macOS.";
const IMG_ALT = "Filthy Net Deck v2.2.0 — Copy the opponent's deck. Free Windows + macOS";

let h = fs.readFileSync("website/index.html", "utf8");
// Windows installer → 2.2.0; mac dmg stays 2.1.0 until the tag CI builds the dmg.
h = h.replace(/Filthy-Net-Deck-Setup-2\.1\.0\.exe/g, "Filthy-Net-Deck-Setup-2.2.0.exe");
h = h.replace(/v2\.1\.0 · Windows installer/g, "v2.2.0 · Windows installer");
h = h.replace(/v2\.1\.0 · NSIS · current user install/g, "v2.2.0 · NSIS · current user install");
h = h.replace(/Standard &amp; Pioneer · v2\.1\.0/g, "Standard &amp; Pioneer · v2.2.0");
h = h.replace(/og-image\.png\?v=[0-9.]+/g, "og-image.png?v=2.2.0");
h = h.replace(/<title>Filthy Net Deck v[^<]+<\/title>/, `<title>${TITLE}</title>`);
h = h.replace(/property="og:title" content="[^"]*"/, `property="og:title" content="${TITLE}"`);
h = h.replace(/name="twitter:title" content="[^"]*"/, `name="twitter:title" content="${TITLE}"`);
h = h.replace(
  /name="description" content="[^"]*"/,
  'name="description" content="Free MTG Arena companion. Matchup Lab guesses the opponent\'s deck from the cards they revealed and copies the closest ranked list to Arena. Windows &amp; macOS."',
);
h = h.replace(
  /property="og:description"\s*content="[^"]*"/,
  `property="og:description"\n      content="${OG_DESC}"`,
);
h = h.replace(
  /name="twitter:description"\s*content="[^"]*"/,
  `name="twitter:description"\n      content="${TW_DESC}"`,
);
h = h.replace(/property="og:image:alt"\s*content="[^"]*"/, `property="og:image:alt"\n      content="${IMG_ALT}"`);
h = h.replace(/name="twitter:image:alt"\s*content="[^"]*"/, `name="twitter:image:alt"\n      content="${IMG_ALT}"`);

// Hero lede: append the v2.2.0 clause after the v2.1.0 Set Radar clause.
h = h.replace(
  /<strong>v2\.1\.0<\/strong> scouts <strong>Set Radar<\/strong> spoilers before Scryfall even catalogs them\.<\/p>/,
  "<strong>v2.1.0</strong> scouts <strong>Set Radar</strong> spoilers before Scryfall even catalogs them, and <strong>v2.2.0</strong> lets you <strong>copy the opponent's deck</strong> straight from Matchup Lab.</p>",
);

// Lead feature card → market this release.
h = h.replace(
  /<p class="fb-kicker">New in v2\.1\.0<\/p>/,
  '<p class="fb-kicker">New in v2.2.0</p>',
);
h = h.replace(
  /<h3>Spoilers before Scryfall even blinks\.<\/h3>/,
  "<h3>Copy the deck that just beat you.</h3>",
);
h = h.replace(
  /(<h3>Copy the deck that just beat you\.<\/h3>\s*<p>)[\s\S]*?(<\/p>)/,
  (_m, p1, p2) =>
    p1 +
    [
      "",
      "                Matchup Lab now reads the cards the tracker saw your opponent play and",
      "                names the <em>closest ranked list</em> — signature cards highlighted so you",
      "                see why. One click <em>copies their deck</em> as an Arena import; another",
      "                sends it to <em>Brew Lab</em> to grade and tune. Read from just the last",
      "                match or union everything they've shown you. Honest by design: it's the",
      "                closest ranked list, never a claim about their exact 75 — and it all stays",
      "                on your PC.",
      "              ",
    ].join("\r\n") +
    p2,
);
h = h.replace(
  /<strong>The Hobbit · Set Radar<\/strong>\s*<span class="stats-pill">86 spoiled · 31 fresh<\/span>\s*<\/div>\s*<div class="stats-mock-rate">\s*<em>Just spoiled<\/em>\s*<b>👁<\/b>\s*<span>ahead of Scryfall<\/span>\s*<\/div>\s*<div class="stats-mock-row">\s*<span>MythicSpoiler leak, unconfirmed<\/span><i style="--w: 40%"><\/i><b>new<\/b>\s*<\/div>\s*<div class="stats-mock-row">\s*<span>Auto-clears once Scryfall confirms<\/span><i style="--w: 70%"><\/i><b>new<\/b>\s*<\/div>/,
  [
    '<strong>vs FoxSlayer · Matchup Lab</strong>',
    '                <span class="stats-pill">closest: Mono-White Auras</span>',
    "              </div>",
    '              <div class="stats-mock-rate">',
    "                <em>~72% match</em>",
    "                <b>📋</b>",
    "                <span>copy their deck</span>",
    "              </div>",
    '              <div class="stats-mock-row">',
    '                <span>Signature cards they revealed</span><i style="--w: 64%"></i><b>seen</b>',
    "              </div>",
    '              <div class="stats-mock-row">',
    '                <span>Improve it in Brew Lab</span><i style="--w: 80%"></i><b>new</b>',
    "              </div>",
  ].join("\r\n"),
);
fs.writeFileSync("website/index.html", h);
console.log("bumped", ver);
