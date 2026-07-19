import fs from "fs";
let h = fs.readFileSync("website/index.html", "utf8");
// Keep shipping 1.4.0 dmg until tag CI produces 1.4.1.
h = h.replaceAll(
  "Filthy-Net-Deck-1.4.1-universal.dmg",
  "Filthy-Net-Deck-1.4.0-universal.dmg",
);
h = h.replaceAll(
  "v1.4.1 · universal .dmg",
  "v1.4.0 · universal .dmg (1.4.1 via tag CI)",
);
h = h.replaceAll(
  "v1.4.1 · Apple silicon + Intel",
  "v1.4.0 · Apple silicon + Intel (1.4.1 via tag CI)",
);
fs.writeFileSync("website/index.html", h);
console.log("macOS interim labels set");
