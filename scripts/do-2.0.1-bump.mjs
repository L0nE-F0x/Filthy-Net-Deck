import fs from "fs";

const ver = "2.0.1";
const notes =
  "v2.0.1: Post-match summary in the overlay (season form + rank path lingers after each game), match-end toasts that land while you're in Arena, and every share PNG rebuilt premium.";
const wn = [
  "Post-match summary in the overlay: season form, recent W/L + rank path lingers ~12s after each game (Settings → In-game overlay)",
  "Match-end toasts now fire from the tracker itself — they land while you're in Arena or the app sits in the tray",
  "Share cards rebuilt premium: brand frames, WR rings, mana pips, sparklines on every shareable PNG",
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

const TITLE = "Filthy Net Deck v2.0.1 — Post-match HUD, toasts that land";
const OG_DESC =
  "Post-match summary lingers in the overlay: season form, recent W/L + rank path. Match-end toasts that land mid-game. Premium share cards. Free, local, Windows + macOS.";
const TW_DESC =
  "Post-match overlay summary (form + rank path), toasts that land mid-game, premium share PNGs. Free MTG Arena companion for Windows + macOS.";
const IMG_ALT =
  "Filthy Net Deck v2.0.1 — Post-match HUD, toasts that land. Free Windows + macOS";

let h = fs.readFileSync("website/index.html", "utf8");
h = h.replace(/Filthy-Net-Deck-Setup-2\.0\.0\.exe/g, "Filthy-Net-Deck-Setup-2.0.1.exe");
h = h.replace(/v2\.0\.0 · Windows installer/g, "v2.0.1 · Windows installer");
h = h.replace(/v2\.0\.0 · NSIS · current user install/g, "v2.0.1 · NSIS · current user install");
h = h.replace(/Standard &amp; Pioneer · v2\.0\.0/g, "Standard &amp; Pioneer · v2.0.1");
// Keep shipping the 2.0.0 dmg until the v2.0.1 tag CI builds a new one.
h = h.replace(/og-image\.png\?v=[0-9.]+/g, "og-image.png?v=2.0.1");
h = h.replace(/<title>Filthy Net Deck v[^<]+<\/title>/, `<title>${TITLE}</title>`);
h = h.replace(/property="og:title" content="[^"]*"/, `property="og:title" content="${TITLE}"`);
h = h.replace(/name="twitter:title" content="[^"]*"/, `name="twitter:title" content="${TITLE}"`);
h = h.replace(
  /name="description" content="[^"]*"/,
  'name="description" content="Free MTG Arena companion. Post-match overlay summary, toasts that land mid-game, premium share cards, multi-source meta. Windows &amp; macOS."',
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

// Lead feature card → market this release (CRLF-safe: regex + function replacers).
h = h.replace(
  /<p class="fb-kicker">New in v2\.0<\/p>/,
  '<p class="fb-kicker">New in v2.0.1</p>',
);
h = h.replace(
  /<h3>Brew Lab grades your list\. Honestly\.<\/h3>/,
  "<h3>The match ends. The story lingers.</h3>",
);
h = h.replace(
  /(<h3>The match ends\. The story lingers\.<\/h3>\s*<p>)[\s\S]*?(<\/p>)/,
  (_m, p1, p2) =>
    p1 +
    [
      "",
      "                A <em>post-match summary</em> now lingers in the overlay after each game —",
      "                result, season record, recent W/L form and your <em>rank path sparkline</em>,",
      "                toggleable in Settings. Match-end toasts fire from the tracker itself, so they",
      "                <em>land while you’re in Arena</em> or the app sits in the tray. And every",
      "                shareable PNG — recaps, matchups, deck cards — was rebuilt premium: brand",
      "                frames, WR rings, mana pips, sparklines. Still fresh from v2.0: Brew Lab",
      "                grades and the Mythic % climb curve.",
      "              ",
    ].join("\r\n") +
    p2,
);
h = h.replace(
  /<div class="stats-mock-head">\s*<strong>Clinic · Golgari Midrange<\/strong>[\s\S]*?<b>in-game<\/b>\s*<\/div>/,
  () =>
    [
      '              <div class="stats-mock-head">',
      "                <strong>Post-match · Izzet Cauldron</strong>",
      '                <span class="stats-pill">Victory · Platinum 2</span>',
      "              </div>",
      '              <div class="stats-mock-rate">',
      "                <em>Season 12–8 · session 3–1</em>",
      "                <b>▲</b>",
      "                <span>rank path · recent form</span>",
      "              </div>",
      '              <div class="stats-mock-row">',
      '                <span>Overlay summary lingers ~12s</span><i style="--w: 80%"></i><b>new</b>',
      "              </div>",
      '              <div class="stats-mock-row">',
      '                <span>Toasts from the tracker itself</span><i style="--w: 90%"></i><b>fixed</b>',
      "              </div>",
    ].join("\r\n"),
);
fs.writeFileSync("website/index.html", h);
console.log("bumped", ver);
