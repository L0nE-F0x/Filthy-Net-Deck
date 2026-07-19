import fs from "fs";

const ver = "1.4.1";
const notes =
  "v1.4.1: Events freshness (no more ancient Melee noise), share menus that work in dark mode, Soundscape with per-cue previews, plus Ugin & Garruk themes (carry into the overlay).";
const wn = [
  "Events stay recent — ancient Melee rows filtered out",
  "Share deck / climb / recap menus redesigned for dark mode",
  "Soundscape: pick a pack and preview every cue",
  "New themes: Ugin (slate) & Garruk (forest) — overlay included",
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
  "<title>Filthy Net Deck v1.4.1 — Polish pass</title>",
);
h = h.replace(
  /name="description" content="[^"]*"/,
  'name="description" content="Free MTG Arena companion. v1.4.1: fresher Events, dark-mode share menus, Soundscape previews, Ugin &amp; Garruk themes. Windows &amp; macOS. 100% local."',
);
h = h.replace(
  /property="og:title" content="[^"]*"/,
  'property="og:title" content="Filthy Net Deck v1.4.1 — Polish pass"',
);
h = h.replace(
  /property="og:description"\s*\r?\n\s*content="[^"]*"/,
  'property="og:description"\n      content="Fresh Events, share menus that work in dark mode, Soundscape with per-cue previews, Ugin &amp; Garruk themes. Free Windows &amp; macOS."',
);
h = h.replace(/og-image\.png\?v=[0-9.]+/g, "og-image.png?v=1.4.1");
h = h.replace(
  /property="og:image:alt"\s*\r?\n\s*content="[^"]*"/,
  'property="og:image:alt"\n      content="Filthy Net Deck v1.4.1 — polish pass — free for Windows + macOS"',
);
h = h.replace(
  /name="twitter:title" content="[^"]*"/,
  'name="twitter:title" content="Filthy Net Deck v1.4.1 — Polish pass"',
);
h = h.replace(
  /name="twitter:description"\s*\r?\n\s*content="[^"]*"/,
  'name="twitter:description"\n      content="v1.4.1: fresher Events, share UX, Soundscape, Ugin &amp; Garruk. Free · Windows + macOS."',
);
h = h.replace(
  /name="twitter:image:alt"\s*\r?\n\s*content="[^"]*"/,
  'name="twitter:image:alt"\n      content="Filthy Net Deck v1.4.1 — polish pass — free for Windows + macOS"',
);
h = h.replace(/Filthy-Net-Deck-Setup-1\.4\.0\.exe/g, "Filthy-Net-Deck-Setup-1.4.1.exe");
h = h.replace(/v1\.4\.0 · Windows installer/g, "v1.4.1 · Windows installer");
h = h.replace(/v1\.4\.0 · NSIS · current user install/g, "v1.4.1 · NSIS · current user install");
h = h.replace(/Standard &amp; Pioneer · v1\.4\.0/g, "Standard &amp; Pioneer · v1.4.1");
h = h.replace(
  /Filthy-Net-Deck-1\.4\.0-universal\.dmg/g,
  "Filthy-Net-Deck-1.4.1-universal.dmg",
);
h = h.replace(/v1\.4\.0 · universal \.dmg/g, "v1.4.1 · universal .dmg");
h = h.replace(/v1\.4\.0 · Apple silicon \+ Intel/g, "v1.4.1 · Apple silicon + Intel");
fs.writeFileSync("website/index.html", h);

console.log("bumped + website patched", ver);
