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

/**
 * Arena's importer is layout-specific, not "anything with //":
 *
 *  - **split** (classic Fire // Ice *and* Duskmourn rooms) — the full
 *    "Front // Back" name. "Unholy Annex" is rejected; "Unholy Annex //
 *    Ritual Chamber" imports. Scryfall files rooms as `layout: split`.
 *  - **adventure / transform / modal_dfc / flip** — front face only.
 *
 * v0.23.0 stripped every " // " name. That was right for MDFCs and
 * adventures, and wrong for rooms — live report 2026-09-01.
 *
 * Keep in sync with `src/services/arenaImport.ts`.
 */
export function arenaWantsBothFaces(name, hints) {
  const layout = String(hints?.layout || "")
    .trim()
    .toLowerCase();
  if (layout === "split") return true;
  if (layout) return false;
  const tl = hints?.typeLine || "";
  if (/\bRoom\b/i.test(tl)) return true;
  if (tl.includes(" // ") && !/\bAdventure\b/i.test(tl)) {
    const faces = tl.split(" // ").map((s) => s.trim());
    if (
      faces.length >= 2 &&
      faces.every((f) => /^(Instant|Sorcery)\b/i.test(f))
    ) {
      return true;
    }
  }
  return splitNameLooksLikeArenaSplit(name);
}

function splitNameLooksLikeArenaSplit(name) {
  const parts = String(name || "")
    .split(" // ")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length < 2) return false;
  if (
    /\b(Room|Chamber|Hall|Gallery|Kitchen|Sauna|Parlor|Cellar|Corridor|Stairs|Yard|Maze|Lab|Diner|Aquarium|Closet|Attic|Gazebo|Oubliette|Salon|Study|Pit|Arcade|Booth|Cistern|Vents|Abattoir|Theater|Crypt|Foyer|Elevator|Pool|Gym|Studio|Office|Lounge|Tunnel|Rotunda)\b/i.test(
      name,
    )
  ) {
    return true;
  }
  return parts.every((p) => /^[A-Za-z][A-Za-z'-]*$/.test(p));
}

export function arenaCardName(name, hints) {
  if (!name) return name;
  const s = String(name);
  const idx = s.indexOf(" // ");
  if (idx === -1) return s;
  if (arenaWantsBothFaces(s, hints)) return s;
  return s.slice(0, idx).trimEnd();
}

export function buildArenaImport(deck) {
  const lines = [];
  if (deck.commander) {
    lines.push("Commander", `1 ${arenaCardName(deck.commander)}`, "");
  }
  lines.push("Deck");
  for (const c of deck.mainboard || []) {
    lines.push(`${c.count} ${arenaCardName(c.name, c)}`);
  }
  if (deck.sideboard?.length) {
    lines.push("", "Sideboard");
    for (const c of deck.sideboard) {
      lines.push(`${c.count} ${arenaCardName(c.name, c)}`);
    }
  }
  return lines.join("\n");
}
