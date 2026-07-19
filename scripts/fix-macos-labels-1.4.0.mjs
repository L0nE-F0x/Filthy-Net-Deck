import fs from "fs";

let h = fs.readFileSync("website/index.html", "utf8");
// Keep href on existing 1.3.5 dmg; honest labels until CI produces 1.4.0.
h = h.replace(
  /href="downloads\/Filthy-Net-Deck-1\.3\.5-universal\.dmg"([\s\S]*?)<span class="btn-meta">[^<]*<\/span>/g,
  (full, mid) => {
    const label = full.includes("Apple")
      ? "v1.3.5 · Apple silicon + Intel (1.4.0 via tag CI)"
      : "v1.3.5 · universal .dmg (1.4.0 via tag CI)";
    return `href="downloads/Filthy-Net-Deck-1.3.5-universal.dmg"${mid}<span class="btn-meta">${label}</span>`;
  },
);
fs.writeFileSync("website/index.html", h);
const metas = [...h.matchAll(/btn-meta">([^<]+)/g)].map((m) => m[1]);
console.log(metas.join("\n"));
