export const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export const BOT =
  "FilthyNetDeck/0.7 (+https://github.com/L0nE-F0x/Filthy-Net-Deck; meta aggregation)";

export async function getText(url, accept = "text/html,application/json,*/*") {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: accept, From: BOT },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.text();
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Parse Arena/MTGO/Goldfish style deck text */
export function parseDeckText(text) {
  const lines = String(text)
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const mainboard = [];
  const sideboard = [];
  let section = "main";

  for (const line of lines) {
    if (/^sideboard$/i.test(line) || /^sb[:\s]/i.test(line)) {
      section = "side";
      continue;
    }
    if (/^(deck|mainboard|main board|companion|commander)$/i.test(line)) {
      section = "main";
      continue;
    }
    // "4 Card Name" or "4x Card Name"
    const m = line.match(/^(\d+)\s*x?\s+(.+)$/i);
    if (!m) continue;
    const name = m[2].replace(/\s*#\d+.*$/, "").trim();
    if (!name || /^(creature|instant|sorcery|land|enchantment|artifact|planeswalker|other)/i.test(name))
      continue;
    const entry = { count: parseInt(m[1], 10), name };
    if (section === "side") sideboard.push(entry);
    else mainboard.push(entry);
  }

  const mainCount = mainboard.reduce((s, c) => s + c.count, 0);
  return { mainboard, sideboard, mainCount };
}

export function buildArenaImport(deck) {
  const lines = [];
  if (deck.commander) {
    lines.push("Commander", `1 ${deck.commander}`, "");
  }
  lines.push("Deck");
  for (const c of deck.mainboard || []) lines.push(`${c.count} ${c.name}`);
  if (deck.sideboard?.length) {
    lines.push("", "Sideboard");
    for (const c of deck.sideboard) lines.push(`${c.count} ${c.name}`);
  }
  return lines.join("\n");
}

export function fuzzyArchetype(a, b) {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.85;
  const xt = new Set(x.split(/[^a-z0-9]+/).filter(Boolean));
  const yt = y.split(/[^a-z0-9]+/).filter(Boolean);
  let hit = 0;
  for (const t of yt) if (xt.has(t)) hit++;
  return yt.length ? hit / yt.length : 0;
}

/** Cards known illegal in Standard / Standard Brawl (rotated or banned). */
const STANDARD_ILLEGAL = new Set(
  [
    "Monastery Swiftspear",
    "Kumano Faces Kakkazan",
    "Experimental Synthesizer",
    "Fable of the Mirror-Breaker",
    "Reckoner Bankbuster",
    "The Meathook Massacre",
  ].map((n) => n.toLowerCase()),
);

export function cardIllegalInFormat(cardName, formatId) {
  const n = String(cardName || "").toLowerCase();
  if (!n) return false;
  if (
    formatId === "standard" ||
    formatId === "standard_brawl" ||
    formatId === "alchemy"
  ) {
    if (STANDARD_ILLEGAL.has(n)) return true;
  }
  return false;
}

/** Drop illegal cards; return false if mainboard becomes too thin. */
export function scrubDeckLegality(deck) {
  if (!deck?.mainboard) return deck;
  const fmt = deck.format || "";
  const filter = (arr) =>
    (arr || []).filter((c) => !cardIllegalInFormat(c.name, fmt));
  deck.mainboard = filter(deck.mainboard);
  deck.sideboard = filter(deck.sideboard);
  const n = deck.mainboard.reduce((s, c) => s + c.count, 0);
  if (n < 50 && deck.listQuality === "authoritative") {
    // Mark as partial so pipeline can replace later
    deck.listQuality = "partial";
    deck.listNote = `${deck.listNote || ""} · legality scrub thinned list`.trim();
  }
  deck.arenaImport = buildArenaImport(deck);
  return deck;
}

/** Apply a verified list onto a deck object */
export function applyListToDeck(deck, list, sourceMeta) {
  if (!list?.mainboard?.length) return false;
  // Reject concatenated multi-card names from bad HTML parsers
  for (const c of list.mainboard) {
    const name = String(c.name || "");
    if (name.length > 45 || /\s\d{1,2}\s+[A-Z]/.test(name)) return false;
  }
  const n = list.mainboard.reduce((s, c) => s + c.count, 0);
  if (n < 50 || n > 110) return false;
  deck.mainboard = list.mainboard;
  deck.sideboard = list.sideboard || [];
  deck.listQuality = "authoritative";
  deck.listNote = sourceMeta.note || `Verified from ${sourceMeta.source}`;
  deck.sources = [
    { name: sourceMeta.sourceLabel || sourceMeta.source, url: sourceMeta.url },
    ...(deck.sources || []).filter((s) => s.url !== sourceMeta.url),
  ];
  scrubDeckLegality(deck);
  deck.arenaImport = buildArenaImport(deck);
  return true;
}
