import type { CardEntry, Deck } from "../types/meta";

/**
 * MTG Arena's deck importer rejects full double-faced / adventure / room
 * names with " // " (e.g. "Unholy Annex // Ritual Chamber"). It expects the
 * **front face only**, which is also how Arena exports lists.
 *
 * Split cards, MDFCs, transform, adventures, and rooms all use the Scryfall
 * "Front // Back" form — strip from the first " // " onward.
 */
export function arenaCardName(name: string): string {
  if (!name) return name;
  const idx = name.indexOf(" // ");
  if (idx === -1) return name;
  return name.slice(0, idx).trimEnd();
}

export function cardsToArenaLines(cards: CardEntry[]): string {
  return cards.map((c) => `${c.count} ${arenaCardName(c.name)}`).join("\n");
}

export function buildArenaImport(
  deck: Pick<Deck, "mainboard" | "sideboard" | "commander">,
): string {
  const lines: string[] = [];
  if (deck.commander) {
    lines.push("Commander");
    lines.push(`1 ${arenaCardName(deck.commander)}`);
    lines.push("");
  }
  lines.push("Deck");
  lines.push(cardsToArenaLines(deck.mainboard));
  if (deck.sideboard.length > 0) {
    lines.push("");
    lines.push("Sideboard");
    lines.push(cardsToArenaLines(deck.sideboard));
  }
  return lines.join("\n");
}

/**
 * Re-normalize a pre-baked `arenaImport` string (from older feeds that still
 * include " // " back faces) so copy always works even before the meta
 * pipeline republishes.
 */
export function sanitizeArenaImportText(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      // Leave section headers alone (Deck / Sideboard / Commander / blank).
      if (!/^\d+\s+/.test(line)) return line;
      const m = line.match(/^(\d+)\s+(.+)$/);
      if (!m) return line;
      return `${m[1]} ${arenaCardName(m[2])}`;
    })
    .join("\n");
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}
