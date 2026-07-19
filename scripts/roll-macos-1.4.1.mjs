import fs from "fs";

let h = fs.readFileSync("website/index.html", "utf8");
h = h.replaceAll(
  "Filthy-Net-Deck-1.4.0-universal.dmg",
  "Filthy-Net-Deck-1.4.1-universal.dmg",
);
h = h.replaceAll(
  "v1.4.0 · universal .dmg (1.4.1 via tag CI)",
  "v1.4.1 · universal .dmg",
);
h = h.replaceAll(
  "v1.4.0 · Apple silicon + Intel (1.4.1 via tag CI)",
  "v1.4.1 · Apple silicon + Intel",
);
h = h.replaceAll("v1.4.0 · universal .dmg", "v1.4.1 · universal .dmg");
h = h.replaceAll(
  "v1.4.0 · Apple silicon + Intel",
  "v1.4.1 · Apple silicon + Intel",
);
fs.writeFileSync("website/index.html", h);
const links = (h.match(/Filthy-Net-Deck-1\.4\.1-universal\.dmg/g) || []).length;
const stale = (h.match(/1\.4\.0-universal/g) || []).length;
console.log({ dmgLinks: links, stale140: stale });
