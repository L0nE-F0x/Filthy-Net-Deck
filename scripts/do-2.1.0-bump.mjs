import fs from "fs";

const ver = "2.1.0";
const notes =
  "v2.1.0: Set Radar now scouts MythicSpoiler for cards Scryfall hasn't catalogued yet — a \"Just spoiled · unconfirmed\" strip on spoiling sets, clearly labeled, that clears itself the moment Scryfall confirms. Radar refresh also runs every 4 hours now (was 3x/day).";
const wn = [
  "Set Radar: unconfirmed spoilers from MythicSpoiler show up before Scryfall catalogs them — a \"Just spoiled\" strip on spoiling sets, clearly labeled and self-clearing once Scryfall confirms",
  "Set radar refresh now runs every 4 hours (was 3x/day), so fresh leaks land faster",
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

const TITLE = "Filthy Net Deck v2.1.0 — Spoilers before Scryfall";
const OG_DESC =
  "Set Radar now scouts MythicSpoiler for cards Scryfall hasn't catalogued yet — unconfirmed, clearly labeled, and self-clearing once confirmed. Free, local, Windows + macOS.";
const TW_DESC =
  "Set Radar scouts MythicSpoiler for spoilers ahead of Scryfall — unconfirmed, clearly labeled, self-clearing. Free MTG Arena companion for Windows + macOS.";
const IMG_ALT = "Filthy Net Deck v2.1.0 — Spoilers before Scryfall. Free Windows + macOS";

let h = fs.readFileSync("website/index.html", "utf8");
// Windows installer → 2.1.0 now; mac dmg link stays 2.0.2 until the tag CI
// builds the new universal dmg (same two-phase staging as every release).
h = h.replace(/Filthy-Net-Deck-Setup-2\.0\.2\.exe/g, "Filthy-Net-Deck-Setup-2.1.0.exe");
h = h.replace(/v2\.0\.2 · Windows installer/g, "v2.1.0 · Windows installer");
h = h.replace(/v2\.0\.2 · NSIS · current user install/g, "v2.1.0 · NSIS · current user install");
h = h.replace(/Standard &amp; Pioneer · v2\.0\.2/g, "Standard &amp; Pioneer · v2.1.0");
h = h.replace(/og-image\.png\?v=[0-9.]+/g, "og-image.png?v=2.1.0");
h = h.replace(/<title>Filthy Net Deck v[^<]+<\/title>/, `<title>${TITLE}</title>`);
h = h.replace(/property="og:title" content="[^"]*"/, `property="og:title" content="${TITLE}"`);
h = h.replace(/name="twitter:title" content="[^"]*"/, `name="twitter:title" content="${TITLE}"`);
h = h.replace(
  /name="description" content="[^"]*"/,
  'name="description" content="Free MTG Arena companion. Set Radar scouts MythicSpoiler for spoilers ahead of Scryfall — unconfirmed, clearly labeled, self-clearing. Windows &amp; macOS."',
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

// Hero lede: append the v2.1.0 clause after the v2.0.2 overlay-stealth clause.
h = h.replace(
  /and <strong>v2\.0\.2<\/strong> sends the overlay stealth: <strong>density modes<\/strong>, an <strong>Opponent tab<\/strong> with the archetype read, turn chips and idle dim — no alt-tab\.<\/p>/,
  "and <strong>v2.0.2</strong> sends the overlay stealth: <strong>density modes</strong>, an <strong>Opponent tab</strong> with the archetype read, turn chips and idle dim — no alt-tab. <strong>v2.1.0</strong> scouts <strong>Set Radar</strong> spoilers before Scryfall even catalogs them.</p>",
);

// Lead feature card → market this release.
h = h.replace(
  /<p class="fb-kicker">New in v2\.0\.2<\/p>/,
  '<p class="fb-kicker">New in v2.1.0</p>',
);
h = h.replace(
  /<h3>Half the overlay\. Twice the intel\.<\/h3>/,
  "<h3>Spoilers before Scryfall even blinks.</h3>",
);
h = h.replace(
  /(<h3>Spoilers before Scryfall even blinks\.<\/h3>\s*<p>)[\s\S]*?(<\/p>)/,
  (_m, p1, p2) =>
    p1 +
    [
      "",
      "                Set Radar now scouts <em>MythicSpoiler</em> for cards Scryfall hasn't",
      "                catalogued yet. During spoiler season a leak often shows up there hours",
      "                before it's official — the radar pulls it into a <em>“Just spoiled ·",
      "                unconfirmed”</em> strip, clearly labeled, and it clears itself the instant",
      "                Scryfall confirms the card. Refresh now runs every <em>4 hours</em> so those",
      "                leaks land fast. Still in from v2.0.2: density modes, the Opponent tab, and",
      "                idle-dim overlay.",
      "              ",
    ].join("\r\n") +
    p2,
);
h = h.replace(
  /<strong>Overlay · vs wraith<\/strong>[\s\S]*?<b>new<\/b>\s*<\/div>\s*<\/div>\s*<\/article>\s*<article class="fb fb-wide fb-stats reveal">\s*<div class="fb-copy">\s*<p class="fb-kicker">Set Radar<\/p>/,
  () =>
    [
      '<strong>The Hobbit · Set Radar</strong>',
      '                <span class="stats-pill">86 spoiled · 31 fresh</span>',
      "              </div>",
      '              <div class="stats-mock-rate">',
      "                <em>Just spoiled</em>",
      "                <b>👁</b>",
      "                <span>ahead of Scryfall</span>",
      "              </div>",
      '              <div class="stats-mock-row">',
      '                <span>MythicSpoiler leak, unconfirmed</span><i style="--w: 40%"></i><b>new</b>',
      "              </div>",
      '              <div class="stats-mock-row">',
      '                <span>Auto-clears once Scryfall confirms</span><i style="--w: 70%"></i><b>new</b>',
      "              </div>",
      "            </div>",
      "          </article>",
      '          <article class="fb fb-wide fb-stats reveal">',
      '            <div class="fb-copy">',
      '              <p class="fb-kicker">Set Radar</p>',
    ].join("\r\n"),
);
h = h.replace(
  /Format hub: rotation dates, Pioneer pool, ban lists with card art\.\s*\r?\n\s*Arrow-key browsing, honest “at release” legality, Arena-eve pings\.\s*\r?\n\s*No Alchemy, no rebalanced junk\./,
  [
    "Format hub: rotation dates, Pioneer pool, ban lists with card art.",
    "                Arrow-key browsing, honest “at release” legality, Arena-eve pings.",
    "                Unconfirmed MythicSpoiler leaks surface ahead of Scryfall, clearly labeled.",
    "                No Alchemy, no rebalanced junk.",
  ].join("\r\n"),
);
fs.writeFileSync("website/index.html", h);
console.log("bumped", ver);
