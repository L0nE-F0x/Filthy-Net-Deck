import fs from "fs";

const ver = "1.4.0";
const notes =
  "v1.4.0 Bells & Whistles: deck share cards, overlay theme sync + hardening (MatchClock, live prefs, click-through), a11y & empty states, and opt-in soft UI sound (3 cue sets) with rank-up moments & micro-interactions.";
const wn = [
  "Share branded deck cards from My Stats (list + WR)",
  "Overlay: Planeswalker theme sync, click-through, live prefs",
  "A11y: reduced motion + clearer first-run empties",
  "Opt-in sound cues + rank-up moment (off by default)",
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
  "<title>Filthy Net Deck v1.4.0 — Bells &amp; Whistles</title>",
);
h = h.replace(
  /name="description" content="[^"]*"/,
  'name="description" content="Free MTG Arena companion. v1.4.0 Bells &amp; Whistles: deck share cards, hardened overlay, a11y, opt-in soft sound. Windows &amp; macOS. 100% local."',
);
h = h.replace(
  /property="og:title" content="[^"]*"/,
  'property="og:title" content="Filthy Net Deck v1.4.0 — Bells &amp; Whistles"',
);
h = h.replace(
  /property="og:description"\s*\r?\n\s*content="[^"]*"/,
  'property="og:description"\n      content="Deck share cards, overlay theme sync + click-through, a11y empties, opt-in soft UI sound &amp; rank-up moments. Free Windows &amp; macOS. 100% local."',
);
h = h.replace(/og-image\.png\?v=[0-9.]+/g, "og-image.png?v=1.4.0");
h = h.replace(
  /property="og:image:alt"\s*\r?\n\s*content="[^"]*"/,
  'property="og:image:alt"\n      content="Filthy Net Deck v1.4.0 — Bells &amp; Whistles — free for Windows + macOS"',
);
h = h.replace(
  /name="twitter:title" content="[^"]*"/,
  'name="twitter:title" content="Filthy Net Deck v1.4.0 — Bells &amp; Whistles"',
);
h = h.replace(
  /name="twitter:description"\s*\r?\n\s*content="[^"]*"/,
  'name="twitter:description"\n      content="v1.4.0: share cards, hardened overlay, a11y, opt-in sound + rank-up. Free · Windows + macOS."',
);
h = h.replace(
  /name="twitter:image:alt"\s*\r?\n\s*content="[^"]*"/,
  'name="twitter:image:alt"\n      content="Filthy Net Deck v1.4.0 — Bells &amp; Whistles — free for Windows + macOS"',
);
// Windows installer filenames + labels (macOS dmg rolled after CI tag)
h = h.replace(/Filthy-Net-Deck-Setup-1\.3\.5\.exe/g, "Filthy-Net-Deck-Setup-1.4.0.exe");
h = h.replace(/v1\.3\.5 · Windows installer/g, "v1.4.0 · Windows installer");
h = h.replace(/v1\.3\.5 · NSIS · current user install/g, "v1.4.0 · NSIS · current user install");
h = h.replace(/Standard &amp; Pioneer · v1\.3\.5/g, "Standard &amp; Pioneer · v1.4.0");
// Keep macOS file link until CI dmg lands; bump label only when file exists.
// For a coherent ship, also retarget macOS names so a later roll is one rename.
h = h.replace(
  /Filthy-Net-Deck-1\.3\.5-universal\.dmg/g,
  "Filthy-Net-Deck-1.4.0-universal.dmg",
);
h = h.replace(/v1\.3\.5 · universal \.dmg/g, "v1.4.0 · universal .dmg");
h = h.replace(/v1\.3\.5 · Apple silicon \+ Intel/g, "v1.4.0 · Apple silicon + Intel");
fs.writeFileSync("website/index.html", h);

console.log("bumped + website patched", ver);
