/**
 * Fix UTF-8 mojibake in website files (UTF-8 bytes misread as Latin-1/Windows-1252
 * and re-saved as UTF-8 — classic â€” / Â· / â€™ corruption).
 */
import fs from "fs";
import path from "path";

const ROOT = "website";

function scoreBad(s) {
  let n = 0;
  const markers = [
    "â€",
    "Â·",
    "Â ",
    "Ã—",
    "â€™",
    "â€“",
    "â€”",
    "â€¦",
    "â†",
    "â–",
    "â—",
    "Â·",
    "â†",
    "â†’",
    "â†‘",
    "â†“",
    "â˜",
  ];
  for (const m of markers) {
    let i = 0;
    while ((i = s.indexOf(m, i)) !== -1) {
      n++;
      i += m.length;
    }
  }
  return n;
}

function tryFix(s) {
  // Primary: interpret current string code units as latin1 bytes → utf8
  try {
    const fixed = Buffer.from(s, "latin1").toString("utf8");
    if (fixed.includes("\uFFFD")) return null;
    if (scoreBad(fixed) < scoreBad(s)) return fixed;
  } catch {
    /* ignore */
  }
  return null;
}

/** Manual fallback replacements if round-trip fails partially. */
function manualFix(s) {
  const map = [
    ["â€”", "—"],
    ["â€“", "–"],
    ["â€™", "’"],
    ["â€˜", "‘"],
    ["â€œ", "“"],
    ["â€\u009d", "”"],
    ["â€¦", "…"],
    ["Â·", "·"],
    ["Â ", " "],
    ["Ã—", "×"],
    ["â†", "←"],
    ["â†’", "→"],
    ["â†‘", "↑"],
    ["â†“", "↓"],
    ["â†’", "→"],
    ["â–¶", "▶"],
    ["â—€", "◀"],
    ["â–²", "▲"],
    ["â–¼", "▼"],
    ["âœ“", "✓"],
    ["âœ–", "✗"],
    // common emoji/icon mojibake in mock UI (best-effort simple icons)
    ["â–¡", "□"],
    ["â¬†", "↗"],
  ];
  let out = s;
  for (const [a, b] of map) out = out.split(a).join(b);
  return out;
}

function processFile(file) {
  const raw = fs.readFileSync(file);
  let text = raw.toString("utf8");
  const before = scoreBad(text);
  if (before === 0 && !text.includes("Â") && !text.includes("â")) {
    return { file, changed: false, before: 0, after: 0 };
  }

  let fixed = tryFix(text);
  if (fixed) {
    // May still need a second pass if double-encoded
    const again = tryFix(fixed);
    if (again && scoreBad(again) < scoreBad(fixed)) fixed = again;
  } else {
    fixed = manualFix(text);
  }

  // Always run manual cleanup for leftovers
  fixed = manualFix(fixed);

  const after = scoreBad(fixed);
  if (fixed !== text) {
    fs.writeFileSync(file, fixed, "utf8");
    return { file, changed: true, before, after };
  }
  return { file, changed: false, before, after };
}

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(html|css|js|json|md|py|txt)$/i.test(name)) out.push(p);
  }
  return out;
}

const files = walk(ROOT);
const results = files.map(processFile).filter((r) => r.changed || r.before > 0);
for (const r of results) {
  console.log(
    `${r.changed ? "FIXED" : "ok   "} bad ${r.before}→${r.after}  ${r.file}`,
  );
}

// Spot-check index.html
const h = fs.readFileSync("website/index.html", "utf8");
const sample = h.split("\n").slice(0, 50).join("\n");
console.log("\n--- title area ---\n");
console.log(sample.split("\n").filter((l) => /title|description|btn-meta|eyebrow|lede/i.test(l)).join("\n"));
console.log("\nremaining bad score", scoreBad(h));
