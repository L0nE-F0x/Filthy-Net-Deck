import fs from "fs";

const ver = "1.5.1";
const notes =
  "v1.5.1 Custom domain: filthy-net-deck.com is primary (Netlify DNS). Legacy netlify.app host still works for installed clients. Meta, updates, and share branding prefer .com.";
const wn = [
  "Official site: filthy-net-deck.com (Netlify DNS)",
  "Meta + version + updater try .com first, then legacy Netlify host",
  "Share cards + recaps brand filthy-net-deck.com",
  "Installed clients on netlify.app keep working — dual-host cutover",
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

// Soft channel: keep installer URL on legacy host so 1.5.0 silent_update allowlist works.
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
  "<title>Filthy Net Deck v1.5.1 — filthy-net-deck.com</title>",
);
h = h.replace(
  /name="description" content="[^"]*"/,
  'name="description" content="Free MTG Arena companion at filthy-net-deck.com. Daily Standard &amp; Pioneer meta, Brew Lab, overlay, share. Windows &amp; macOS."',
);
h = h.replace(
  /property="og:title" content="[^"]*"/,
  'property="og:title" content="Filthy Net Deck — filthy-net-deck.com"',
);
h = h.replace(
  /property="og:description"\s*\r?\n\s*content="[^"]*"/,
  'property="og:description"\n      content="Official site: filthy-net-deck.com. Daily Standard &amp; Pioneer meta companion — Brew Lab, overlay, share. Free Windows &amp; macOS."',
);
h = h.replace(/og-image\.png\?v=[0-9.]+/g, "og-image.png?v=1.5.1");
h = h.replace(
  /property="og:image:alt"\s*\r?\n\s*content="[^"]*"/,
  'property="og:image:alt"\n      content="Filthy Net Deck — filthy-net-deck.com — free for Windows + macOS"',
);
h = h.replace(
  /name="twitter:title" content="[^"]*"/,
  'name="twitter:title" content="Filthy Net Deck — filthy-net-deck.com"',
);
h = h.replace(
  /name="twitter:description"\s*\r?\n\s*content="[^"]*"/,
  'name="twitter:description"\n      content="Official domain live: filthy-net-deck.com. Free MTG Arena meta companion — Windows + macOS."',
);
h = h.replace(
  /name="twitter:image:alt"\s*\r?\n\s*content="[^"]*"/,
  'name="twitter:image:alt"\n      content="Filthy Net Deck — filthy-net-deck.com — free for Windows + macOS"',
);
// Versioned download filenames (relative paths — work on both hosts)
h = h.replace(/Filthy-Net-Deck-Setup-1\.5\.0\.exe/g, `Filthy-Net-Deck-Setup-${ver}.exe`);
h = h.replace(/Filthy-Net-Deck-1\.5\.0-universal\.dmg/g, `Filthy-Net-Deck-${ver}-universal.dmg`);
h = h.replace(/v1\.5\.0/g, `v${ver}`);
fs.writeFileSync("website/index.html", h);

console.log(`Bumped to ${ver}`);
