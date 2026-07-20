import fs from "fs";

const ver = "2.0.2";
const notes =
  "v2.0.2: The overlay went stealth — density modes shrink the footprint (Minimal is text-only), an Opponent tab lists every card they've shown with the archetype read, turn/play/mulligan chips, idle dim, and it remembers your size & position.";
const wn = [
  "Overlay density modes — Compact is the new default, Minimal is a text-only HUD; pick in the ⚙ pill or Settings",
  "Opponent tab in the overlay: every card they've shown this match, grouped, with the archetype read on top",
  "Turn, play/draw and mulligan chips live in the HUD — and it dims until you hover (toggleable)",
  "Overlay size & position are remembered — and rescued automatically if a monitor changes",
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

const TITLE = "Filthy Net Deck v2.0.2 — The overlay went stealth";
const OG_DESC =
  "Half the overlay, twice the intel: density modes, an Opponent tab with the archetype read, turn/play/mulligan chips, idle dim. Free, local, Windows + macOS.";
const TW_DESC =
  "Overlay redesign: density modes (Minimal = text-only), Opponent tab + archetype read, turn chips, idle dim. Free MTG Arena companion for Windows + macOS.";
const IMG_ALT =
  "Filthy Net Deck v2.0.2 — The overlay went stealth. Free Windows + macOS";

let h = fs.readFileSync("website/index.html", "utf8");
// Windows installer → 2.0.2 now; the mac dmg links stay 2.0.1 until tag CI
// builds the new universal dmg (same staging as every release).
h = h.replace(/Filthy-Net-Deck-Setup-2\.0\.1\.exe/g, "Filthy-Net-Deck-Setup-2.0.2.exe");
h = h.replace(/v2\.0\.1 · Windows installer/g, "v2.0.2 · Windows installer");
h = h.replace(/v2\.0\.1 · NSIS · current user install/g, "v2.0.2 · NSIS · current user install");
h = h.replace(/Standard &amp; Pioneer · v2\.0\.1/g, "Standard &amp; Pioneer · v2.0.2");
h = h.replace(/og-image\.png\?v=[0-9.]+/g, "og-image.png?v=2.0.2");
h = h.replace(/<title>Filthy Net Deck v[^<]+<\/title>/, `<title>${TITLE}</title>`);
h = h.replace(/property="og:title" content="[^"]*"/, `property="og:title" content="${TITLE}"`);
h = h.replace(/name="twitter:title" content="[^"]*"/, `name="twitter:title" content="${TITLE}"`);
h = h.replace(
  /name="description" content="[^"]*"/,
  'name="description" content="Free MTG Arena companion. Discreet in-game overlay with density modes, Opponent tab + archetype read, turn chips, idle dim. Windows &amp; macOS."',
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

// Hero lede: retire the ⚙-pill clause for the v2.0.2 overlay story.
h = h.replace(
  /and the in-game overlay grew a <strong>⚙ quick-settings pill<\/strong> — no alt-tab\./,
  "and <strong>v2.0.2</strong> sends the overlay stealth: <strong>density modes</strong>, an <strong>Opponent tab</strong> with the archetype read, turn chips and idle dim — no alt-tab.",
);

// Lead feature card → market this release (CRLF-safe: regex + function replacers).
h = h.replace(
  /<p class="fb-kicker">New in v2\.0\.1<\/p>/,
  '<p class="fb-kicker">New in v2.0.2</p>',
);
h = h.replace(
  /<h3>The match ends\. The story lingers\.<\/h3>/,
  "<h3>Half the overlay. Twice the intel.</h3>",
);
h = h.replace(
  /(<h3>Half the overlay\. Twice the intel\.<\/h3>\s*<p>)[\s\S]*?(<\/p>)/,
  (_m, p1, p2) =>
    p1 +
    [
      "",
      "                The in-game HUD went stealth. <em>Density modes</em> shrink the footprint —",
      "                Compact is the new default, <em>Minimal</em> is a text-only tracker barely",
      "                wider than a card name. A new <em>Opponent tab</em> lists every card they've",
      "                shown this match with the <em>archetype read</em> and your record against it.",
      "                Turn, play/draw and mulligan chips ride the bar, the panel <em>dims until you",
      "                hover</em>, and your size &amp; position are remembered — even across monitor",
      "                changes. Still in from v2.0.1: the post-match summary and premium share cards.",
      "              ",
    ].join("\r\n") +
    p2,
);
h = h.replace(
  /<strong>Post-match · Izzet Cauldron<\/strong>[\s\S]*?<b>fixed<\/b>\s*<\/div>/,
  () =>
    [
      "<strong>Overlay · vs wraith</strong>",
      '                <span class="stats-pill">T6 · Play · 41 left</span>',
      "              </div>",
      '              <div class="stats-mock-rate">',
      "                <em>Opponent · 6 seen</em>",
      "                <b>👁</b>",
      "                <span>reads like Dimir Midrange</span>",
      "              </div>",
      '              <div class="stats-mock-row">',
      '                <span>Minimal density — text-only HUD</span><i style="--w: 46%"></i><b>new</b>',
      "              </div>",
      '              <div class="stats-mock-row">',
      '                <span>Dims until you hover</span><i style="--w: 60%"></i><b>new</b>',
      "              </div>",
    ].join("\r\n"),
);
fs.writeFileSync("website/index.html", h);
console.log("bumped", ver);
