/**
 * Re-apply v1.2.0 marketing strings to a clean UTF-8 website/index.html
 * without corrupting multi-byte characters.
 */
import fs from "fs";

const ver = "1.2.0";
const mid = "\u00b7"; // ·
const em = "\u2014"; // —
const en = "\u2013"; // –

let h = fs.readFileSync("website/index.html", "utf8");

// Titles / SEO
h = h.replace(
  /<title>[\s\S]*?<\/title>/,
  `<title>Filthy Net Deck v1.2 ${em} Tracker coach &amp; share cards</title>`,
);
h = h.replace(
  /name="description" content="[^"]*"/,
  `name="description" content="Free MTG Arena companion. v1.2: first-session tracker coach, deeper health, climb/week/theme share cards. Windows &amp; macOS. 100% local."`,
);
h = h.replace(
  /property="og:title" content="[^"]*"/,
  `property="og:title" content="Filthy Net Deck v1.2 ${em} Next chapter"`,
);
h = h.replace(
  /property="og:description"\s*\n\s*content="[^"]*"/,
  `property="og:description"\n      content="NEW: first-session tracker coach, climb/week/theme share cards. Free Windows &amp; macOS. 100% local."`,
);
h = h.replace(
  /property="og:image:alt"\s*\n\s*content="[^"]*"/,
  `property="og:image:alt"\n      content="Filthy Net Deck v1.2 ${em} Next chapter ${em} free for Windows + macOS"`,
);
h = h.replace(
  /name="twitter:title" content="[^"]*"/,
  `name="twitter:title" content="Filthy Net Deck v1.2 ${em} Next chapter"`,
);
h = h.replace(
  /name="twitter:description"\s*\n\s*content="[^"]*"/,
  `name="twitter:description"\n      content="v1.2: tracker coach + share cards. Free ${mid} Windows + macOS."`,
);
h = h.replace(
  /name="twitter:image:alt"\s*\n\s*content="[^"]*"/,
  `name="twitter:image:alt"\n      content="Filthy Net Deck v1.2 ${em} Next chapter ${em} free for Windows + macOS"`,
);

// Cache-bust OG
h = h.replace(/og-image\.png\?v=[0-9.]+/g, `og-image.png?v=${ver}`);

// Windows download links + labels (not mac dmg)
h = h.replace(
  /Filthy-Net-Deck-Setup-1\.[0-9.]+\.exe/g,
  `Filthy-Net-Deck-Setup-${ver}.exe`,
);

// Fix Windows btn-meta after each setup-1.2.0 link without touching dmg labels
{
  const needle = `Filthy-Net-Deck-Setup-${ver}.exe`;
  let out = "";
  let rest = h;
  while (true) {
    const i = rest.indexOf(needle);
    if (i < 0) {
      out += rest;
      break;
    }
    out += rest.slice(0, i + needle.length);
    const chunk = rest.slice(i + needle.length);
    // only rewrite v1.x.x in the next 500 chars for Windows labels
    const head = chunk
      .slice(0, 500)
      .replace(/v1\.\d+\.\d+/g, `v${ver}`);
    out += head;
    rest = chunk.slice(500);
  }
  h = out;
}

// Hero lede — keep rich copy, pin v1.2 next chapter
h = h.replace(
  /<strong>v1\.1<\/strong> adds <strong>Planeswalker themes<\/strong> and connects the whole app:/,
  `<strong>v1.2</strong> adds a <strong>first-session tracker coach</strong> and <strong>share cards</strong> (climb, week recap, themes). v1.1 brought planeswalker skins and deep links:`,
);

// Mock chrome version
h = h.replace(
  /Standard &amp; Pioneer \u00b7 v1\.\d+\.\d+/,
  `Standard &amp; Pioneer ${mid} v${ver}`,
);
h = h.replace(
  /Standard &amp; Pioneer · v1\.\d+\.\d+/,
  `Standard &amp; Pioneer ${mid} v${ver}`,
);

// Ensure no mojibake remnants
if (/â|Â·|Ã/.test(h)) {
  console.error("WARNING: mojibake still present after patch");
}

fs.writeFileSync("website/index.html", h, "utf8");

// Sanity print
const lines = h.split(/\n/).filter((l) => /v1\.[12]|og:title|btn-meta|description content|lede/i.test(l));
for (const l of lines.slice(0, 30)) console.log(l.trim().slice(0, 130));
console.log("middot", (h.match(/\u00b7/g) || []).length, "emdash", (h.match(/\u2014/g) || []).length);
console.log("mojibake", /â|Â·/.test(h));
