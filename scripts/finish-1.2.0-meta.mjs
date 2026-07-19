import fs from "fs";

const ver = "1.2.0";
const notes =
  "v1.2.0: First-session coach (log found → first match → first tag), deeper tracker health and Arena parse warnings, share cards for climb story / week recap / theme skins, signed Update & restart stays primary.";

const soft = {
  version: ver,
  downloadUrl: `https://filthy-net-deck.netlify.app/downloads/Filthy-Net-Deck-Setup-${ver}.exe`,
  notes,
};
fs.writeFileSync("website/version.json", JSON.stringify(soft, null, 2) + "\n");
fs.writeFileSync("public/version.json", JSON.stringify(soft, null, 2) + "\n");

let h = fs.readFileSync("website/index.html", "utf8");
h = h.replace(
  /content="NEW: [^"]+"/,
  'content="NEW: first-session tracker coach, climb/week/theme share cards. Free Windows &amp; macOS. 100% local."',
);
h = h.replace(
  /content="v1\.2: [^"]*"/,
  'content="v1.2: tracker coach + share cards. Free · Windows + macOS."',
);
// Fix mangled arrow text if present
h = h.replace(/logmatchtag coach/g, "first-session tracker coach");
fs.writeFileSync("website/index.html", h);

console.log("meta ok", soft.version);
