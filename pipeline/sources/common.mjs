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

/** Apply a verified list onto a deck object */
export function applyListToDeck(deck, list, sourceMeta) {
  if (!list?.mainboard?.length) return false;
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
  deck.arenaImport = buildArenaImport(deck);
  return true;
}
