import fs from "fs";

/** Align website marketing meta + copy with v1.4.4 (AGENTS share-card surface). */
let h = fs.readFileSync("website/index.html", "utf8");

h = h.replace(
  /name="description" content="[^"]*"/,
  'name="description" content="Free MTG Arena companion. v1.4.4: hover help everywhere, Events fixed, last-played deck sort, overlay + Soundscape. Windows &amp; macOS. 100% local."',
);
h = h.replace(
  /property="og:description"\s*\r?\n\s*content="[^"]*"/,
  'property="og:description"\n      content="Hover help across Climb, Matchups &amp; Decks. Events show magic.gg + MTGO. Last-played stats. Overlay, share cards, Soundscape. Free Win + macOS."',
);
h = h.replace(
  /property="og:image:alt"\s*\r?\n\s*content="[^"]*"/,
  'property="og:image:alt"\n      content="Filthy Net Deck v1.4.4 — tooltips, Events, overlay — free for Windows + macOS"',
);
h = h.replace(
  /name="twitter:description"\s*\r?\n\s*content="[^"]*"/,
  'name="twitter:description"\n      content="v1.4.4: hover help, fixed Events, last-played decks, overlay &amp; Soundscape. Free · Windows + macOS."',
);
h = h.replace(
  /name="twitter:image:alt"\s*\r?\n\s*content="[^"]*"/,
  'name="twitter:image:alt"\n      content="Filthy Net Deck v1.4.4 — tooltips, Events, overlay — free for Windows + macOS"',
);
// macOS interim until CI dmg lands
h = h.replaceAll(
  "Filthy-Net-Deck-1.4.1-universal.dmg",
  "Filthy-Net-Deck-1.4.1-universal.dmg",
);
h = h.replace(
  /v1\.4\.1 · universal \.dmg/g,
  "v1.4.1 · universal .dmg (1.4.4 via tag CI)",
);
h = h.replace(
  /v1\.4\.1 · Apple silicon \+ Intel/g,
  "v1.4.1 · Apple silicon + Intel (1.4.4 via tag CI)",
);

fs.writeFileSync("website/index.html", h);
console.log("website marketing meta aligned to 1.4.4");
