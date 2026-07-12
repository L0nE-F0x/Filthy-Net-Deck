export const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export const BOT =
  "FilthyNetDeck/0.8 (+https://github.com/L0nE-F0x/Filthy-Net-Deck; meta aggregation)";

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
