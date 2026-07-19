import fs from "fs";

const path = "src/services/shareCards.ts";
let s = fs.readFileSync(path, "utf8");
s = s.replace(
  /filthy-net-deck\.netlify\.app[^\n"]*Built by ApexForge/g,
  "filthy-net-deck.com · Built by ApexForge",
);
fs.writeFileSync(path, s);
const left = (s.match(/filthy-net-deck\.netlify\.app/g) || []).length;
console.log("shareCards remaining netlify.app:", left);
for (const line of s.split("\n")) {
  if (line.includes("Built by ApexForge")) console.log(line.trim());
}
