import fs from "fs";

const ver = "2.6.0";
const notes =
  "v2.6.0: Sharper opponent-deck reads (Lessons/Control twins no longer collapse), overlay remembers size between matches, full card galleries for every Standard set, and a post-match rank graph that moves with each win or loss inside a tier.";
const wn = [
  "Opponent deck reads are smarter — rare signature cards outweigh shared staples so Jeskai/Izzet Lessons and 4c Control stop getting mixed up",
  "In-match overlay remembers the size you set — no more resizing every new queue",
  "Every Standard set on the Sets page now opens a full card gallery (not just 14 previews)",
  "Post-match rank graph ticks up or down each game inside a tier, not only when you promote",
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
h = h.replace(/Filthy-Net-Deck-Setup-2\.5\.4\.exe/g, `Filthy-Net-Deck-Setup-${ver}.exe`);
h = h.replace(/Filthy-Net-Deck-2\.5\.4-universal\.dmg/g, `Filthy-Net-Deck-${ver}-universal.dmg`);
h = h.replace(/v2\.5\.4 · Windows installer/g, `v${ver} · Windows installer`);
h = h.replace(/v2\.5\.4 · universal \.dmg/g, `v${ver} · universal .dmg`);
h = h.replace(/v2\.5\.4 · NSIS · current user install/g, `v${ver} · NSIS · current user install`);
h = h.replace(/v2\.5\.4 · Apple silicon \+ Intel/g, `v${ver} · Apple silicon + Intel`);
h = h.replace(/Standard &amp; Pioneer · v2\.5\.4/g, `Standard &amp; Pioneer · v${ver}`);
h = h.replace(/og-image\.png\?v=2\.5\.4/g, `og-image.png?v=${ver}`);
h = h.replace(
  /Filthy Net Deck v2\.5\.4 — MTG Arena companion for Standard &amp; Pioneer/g,
  `Filthy Net Deck v${ver} — MTG Arena companion for Standard &amp; Pioneer`,
);
h = h.replace(
  /Filthy Net Deck v2\.5\.4 — MTG Arena companion\. Free Windows \+ macOS/g,
  `Filthy Net Deck v${ver} — MTG Arena companion. Free Windows + macOS`,
);
// Meta description / OG description — market the release.
h = h.replace(
  /content="Free MTG Arena companion for Standard &amp; Pioneer\. Live meta, in-match overlay, local winrate tracking\. Desktop only\."/g,
  `content="v${ver}: smarter opponent deck reads, overlay size memory, full set galleries, and a post-match rank graph that moves every game. Free MTG Arena companion for Standard &amp; Pioneer."`,
);
fs.writeFileSync("website/index.html", h);

// OG generator feature lines if present
const ogPy = "website/assets/_gen_og.py";
if (fs.existsSync(ogPy)) {
  let py = fs.readFileSync(ogPy, "utf8");
  // Best-effort: bump any VERSION = "x.y.z" or badge string
  py = py.replace(/VERSION\s*=\s*"[^"]+"/g, `VERSION = "${ver}"`);
  py = py.replace(/v2\.5\.\d+/g, `v${ver}`);
  fs.writeFileSync(ogPy, py);
}

console.log("bumped", ver);
console.log("notes:", notes);
console.log("whats_new:", wn.length, "bullets");
