import fs from "fs";

let h = fs.readFileSync("website/index.html", "utf8");

// After each Windows 1.2.0 setup link, bump nearby v1.1.1 labels (btn-meta) to 1.2.0
// without touching macOS .dmg lines still on 1.1.1.
const needle = "Filthy-Net-Deck-Setup-1.2.0.exe";
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
  const head = chunk.slice(0, 700).replace(/v1\.1\.1/g, "v1.2.0");
  out += head;
  rest = chunk.slice(700);
}
h = out;

// Hero mock app version
h = h.replace(/Pioneer · v1\.1\.1/g, "Pioneer · v1.2.0");
h = h.replace(/Pioneer Â· v1\.1\.1/g, "Pioneer · v1.2.0");
// mojibake middle-dot variants
h = h.replace(/(Pioneer.{0,6})v1\.1\.1/g, "$1v1.2.0");

fs.writeFileSync("website/index.html", h);

const lines = h.split("\n").filter((l) => /1\.2\.0|1\.1\.1/.test(l));
for (const l of lines) console.log(l.trim().slice(0, 120));
