import fs from "fs";

const path = "website/index.html";
let h = fs.readFileSync(path, "utf8");

// Point macOS buttons at the CI dmg and drop interim labels.
h = h.replaceAll(
  "Filthy-Net-Deck-1.3.5-universal.dmg",
  "Filthy-Net-Deck-1.4.0-universal.dmg",
);
h = h.replaceAll(
  "v1.3.5 · universal .dmg (1.4.0 via tag CI)",
  "v1.4.0 · universal .dmg",
);
h = h.replaceAll(
  "v1.3.5 · Apple silicon + Intel (1.4.0 via tag CI)",
  "v1.4.0 · Apple silicon + Intel",
);
// Fallbacks if interim wording differed
h = h.replaceAll("v1.3.5 · universal .dmg", "v1.4.0 · universal .dmg");
h = h.replaceAll(
  "v1.3.5 · Apple silicon + Intel",
  "v1.4.0 · Apple silicon + Intel",
);

fs.writeFileSync(path, h);
const dmgLinks = (h.match(/Filthy-Net-Deck-1\.4\.0-universal\.dmg/g) || []).length;
const stale = (h.match(/1\.3\.5-universal/g) || []).length;
console.log({ dmgLinks, stale135: stale });
