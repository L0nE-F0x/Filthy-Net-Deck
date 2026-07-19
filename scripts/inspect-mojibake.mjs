import fs from "fs";

const h = fs.readFileSync("website/index.html", "utf8");
const lines = h.split(/\n/);
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  if (/â|Â|Ã|\uFFFD/.test(l)) {
    console.log((i + 1) + ": " + JSON.stringify(l.trim().slice(0, 140)));
  }
}
// show codepoints around mock-ico lines
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("mock-ico")) {
    const s = lines[i].trim();
    console.log("ICO", i + 1, [...s].map((c) => c + " U+" + c.codePointAt(0).toString(16)).join(" | "));
  }
}
