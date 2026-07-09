import type { CardEntry, Deck } from "../types/meta";

export function cardsToArenaLines(cards: CardEntry[]): string {
  return cards.map((c) => `${c.count} ${c.name}`).join("\n");
}

export function buildArenaImport(deck: Pick<Deck, "mainboard" | "sideboard" | "commander">): string {
  const lines: string[] = [];
  if (deck.commander) {
    lines.push("Commander");
    lines.push(`1 ${deck.commander}`);
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
