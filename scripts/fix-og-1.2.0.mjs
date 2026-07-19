import fs from "fs";

const mid = "\u00b7";
let py = fs.readFileSync("website/assets/_gen_og.py", "utf8");

// Recover if mojibake
try {
  const fixed = Buffer.from(py, "latin1").toString("utf8");
  if ((fixed.match(/\u2014/g) || []).length > (py.match(/\u2014/g) || []).length) {
    py = fixed;
  }
} catch {
  /* ignore */
}

// Manual common fixes
py = py.replace(/â€”/g, "\u2014");
py = py.replace(/Â·/g, mid);

py = py.replace(
  /badge_text = f"NEW  \{mid\}  [^"]+"/,
  'badge_text = f"NEW  {mid}  v1.2  {mid}  NEXT CHAPTER"',
);

py = py.replace(
  /draw\.text\(\(70, H - 40\), "[^"]*", font=small_font, fill=MUTED\)/,
  `draw.text((70, H - 40), "v1.2.0  ${mid}  Windows + macOS", font=small_font, fill=MUTED)`,
);

// Feature lines
py = py.replace(
  /lines = \[[\s\S]*?\]/,
  `lines = [
        "Daily Standard & Pioneer meta.",
        "First-session tracker coach.",
        "Climb / week / theme share cards.",
        f"No Alchemy {mid} 100% local {mid} free Win + macOS.",
    ]`,
);

fs.writeFileSync("website/assets/_gen_og.py", py, "utf8");
console.log("og py written");
console.log("mojibake left", /â|Â·/.test(py));
