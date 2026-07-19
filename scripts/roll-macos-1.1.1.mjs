import fs from "fs";

const path = "website/index.html";
let h = fs.readFileSync(path, "utf8");
const n1 = (h.match(/Filthy-Net-Deck-0\.22\.0-universal\.dmg/g) || []).length;
h = h.replaceAll(
  "Filthy-Net-Deck-0.22.0-universal.dmg",
  "Filthy-Net-Deck-1.1.1-universal.dmg",
);
h = h.replaceAll("v0.22.0 · universal .dmg", "v1.1.1 · universal .dmg");
h = h.replaceAll("v0.22.0 · Apple silicon + Intel", "v1.1.1 · Apple silicon + Intel");
fs.writeFileSync(path, h);
const left = (h.match(/0\.22\.0-universal/g) || []).length;
const ok = (h.match(/1\.1\.1-universal\.dmg/g) || []).length;
console.log({ replaced: n1, dmgLinks: ok, leftover022: left });
