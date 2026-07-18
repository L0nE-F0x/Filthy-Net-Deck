import fs from "fs";

let py = fs.readFileSync("website/assets/_gen_og.py", "utf8");
py = py.replace(
  /badge_text = f"NEW  \{mid\}  v[^"]+"/,
  'badge_text = f"NEW  {mid}  v1.1  {mid}  PLANESWALKER THEMES"',
);
py = py.replace(
  /lines = \[[\s\S]*?\n    \]/,
  `lines = [
        "Daily Standard & Pioneer meta.",
        f"Planeswalker color themes.",
        f"Dark / Light still stack.",
        f"No Alchemy {mid} 100% local {mid} free Win + macOS.",
    ]`,
);
py = py.replace(/v[0-9.]+  ·  Windows \+ macOS/, "v1.1.0  ·  Windows + macOS");
fs.writeFileSync("website/assets/_gen_og.py", py);

let h = fs.readFileSync("website/index.html", "utf8");
// download / mock version pins
h = h.replace(/Filthy-Net-Deck-Setup-1\.0\.0\.exe/g, "Filthy-Net-Deck-Setup-1.1.0.exe");
h = h.replace(/v0\.26\.0/g, "v1.1.0");
h = h.replace(/v1\.0\.0/g, "v1.1.0");
h = h.replace(/og-image\.png\?v=[0-9.]+/g, "og-image.png?v=1.1.0");

h = h.replace(
  /<title>[^<]*<\/title>/,
  "<title>Filthy Net Deck v1.1 — Planeswalker themes &amp; deep links</title>",
);
h = h.replace(
  /name="description"\s+content="[^"]*"/,
  'name="description" content="Free MTG Arena companion. v1.1: Planeswalker themes (Chandra, Teferi, Liliana, Ajani, Elspeth) plus deep links across every page. Windows &amp; macOS. 100% local."',
);
h = h.replace(
  /property="og:title" content="[^"]*"/,
  'property="og:title" content="Filthy Net Deck v1.1 — Planeswalker themes"',
);
h = h.replace(
  /property="og:description"\s*\n\s*content="[^"]*"/,
  'property="og:description"\n      content="NEW: Chandra, Teferi, Liliana, Ajani &amp; Elspeth accent skins. Dark/Light still stack. Free Windows &amp; macOS. 100% local."',
);
h = h.replace(
  /property="og:image:alt"\s*\n\s*content="[^"]*"/,
  'property="og:image:alt"\n      content="Filthy Net Deck v1.1 — Planeswalker themes — free for Windows + macOS"',
);
h = h.replace(
  /name="twitter:title" content="[^"]*"/,
  'name="twitter:title" content="Filthy Net Deck v1.1 — Planeswalker themes"',
);
h = h.replace(
  /name="twitter:description"\s*\n\s*content="[^"]*"/,
  'name="twitter:description"\n      content="v1.1: Planeswalker themes from the sidebar. Dark/Light still work. Free · Windows + macOS."',
);
h = h.replace(
  /name="twitter:image:alt"\s*\n\s*content="[^"]*"/,
  'name="twitter:image:alt"\n      content="Filthy Net Deck v1.1 — Planeswalker themes — free for Windows + macOS"',
);

// Hero lede — mention themes
if (!h.includes("Planeswalker themes")) {
  h = h.replace(
    /<strong>v1\.1<\/strong> connects the whole app:/,
    "<strong>v1.1</strong> adds <strong>Planeswalker themes</strong> and connects the whole app:",
  );
}
// fallback if hero still says v1.0
h = h.replace(
  /<strong>v1\.0<\/strong> connects the whole app:/,
  "<strong>v1.1</strong> adds <strong>Planeswalker themes</strong> and connects the whole app:",
);

fs.writeFileSync("website/index.html", h);
console.log("marketing patched for 1.1.0");
