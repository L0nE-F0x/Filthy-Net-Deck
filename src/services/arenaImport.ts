import type { CardEntry, Deck } from "../types/meta";

/**
 * Hints that decide whether Arena's importer wants "Front // Back" or
 * the front face alone. `layout` from Scryfall is authoritative; `typeLine`
 * covers overlay/My Stats rows that never stored layout; the name itself
 * is the fallback for pre-baked strings.
 */
export type ArenaNameHints = {
  layout?: string | null;
  typeLine?: string | null;
};

/**
 * Arena's importer is layout-specific, not "anything with //":
 *
 *  - **split** (classic Fire // Ice *and* Duskmourn rooms) — the full
 *    "Front // Back" name. "Unholy Annex" is rejected; "Unholy Annex //
 *    Ritual Chamber" imports. Scryfall files rooms as `layout: split`.
 *  - **adventure / transform / modal_dfc / flip** — front face only.
 *    "Brazen Borrower // Petty Theft" is rejected; "Brazen Borrower" works.
 *
 * v0.23.0 stripped every " // " name. That was right for MDFCs and
 * adventures, and wrong for rooms — live report 2026-09-01, same Demons
 * list Goldfish already exports with both faces.
 *
 * Keep in sync with `pipeline/sources/common.mjs`.
 */
export function arenaWantsBothFaces(
  name: string,
  hints?: ArenaNameHints,
): boolean {
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

/** Name-only guess used when a pre-baked line has no layout/typeLine. */
function splitNameLooksLikeArenaSplit(name: string): boolean {
  const parts = String(name || "")
    .split(" // ")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length < 2) return false;
  // Rooms: a face usually names the room. Closed set from Duskmourn; the
  // words are distinctive enough not to collide with Pathway/Adventure DFCs.
  if (
    /\b(Room|Chamber|Hall|Gallery|Kitchen|Sauna|Parlor|Cellar|Corridor|Stairs|Yard|Maze|Lab|Diner|Aquarium|Closet|Attic|Gazebo|Oubliette|Salon|Study|Pit|Arcade|Booth|Cistern|Vents|Abattoir|Theater|Crypt|Foyer|Elevator|Pool|Gym|Studio|Office|Lounge|Tunnel|Rotunda)\b/i.test(
      name,
    )
  ) {
    return true;
  }
  // Classic splits: both faces are a single word (Fire // Ice, Bedeck //
  // Bedazzle). Pathways, adventures and transform cards have longer names.
  return parts.every((p) => /^[A-Za-z][A-Za-z'-]*$/.test(p));
}

export function arenaCardName(name: string, hints?: ArenaNameHints): string {
  if (!name) return name;
  const idx = name.indexOf(" // ");
  if (idx === -1) return name;
  if (arenaWantsBothFaces(name, hints)) return name;
  return name.slice(0, idx).trimEnd();
}

export function cardsToArenaLines(cards: CardEntry[]): string {
  return cards
    .map((c) => `${c.count} ${arenaCardName(c.name, c)}`)
    .join("\n");
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
 * Re-normalize a pre-baked `arenaImport` string so copy always works even
 * before the meta pipeline republishes. Rooms/splits keep " // "; MDFC /
 * adventure / transform lines still lose the back face.
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

/* ------------------------------------------------------------------ */
/* Parse a pasted decklist (Arena / MTGO / Goldfish) for the My Stats clinic. */
/* ------------------------------------------------------------------ */

export interface ParsedDeckLine {
  name: string;
  count: number;
}

export interface ParsedDeckText {
  main: ParsedDeckLine[];
  side: ParsedDeckLine[];
  /** Non-empty lines that were not card lines or known headers. */
  skipped: string[];
}

/** Strip Arena export set/collector suffix: "4 Shock (M21) 159" → "Shock". */
function stripSetSuffix(name: string): string {
  return name.replace(/\s*\([A-Z0-9]{2,6}\)(\s+[\dA-Za-z★-]+)?\s*$/, "").trim();
}

/**
 * Parse pasted deck text into main/side card lines.
 * Understands Arena export ("Deck"/"Sideboard" headers, "(SET) 123" suffixes),
 * "4x Name" style, and MTGO-style blank-line separation (a blank line after a
 * plausible mainboard starts the sideboard). Card names are kept verbatim
 * beyond suffix cleanup — resolution happens against Scryfall, never guessed.
 */
export function parseDeckText(text: string): ParsedDeckText {
  const main: ParsedDeckLine[] = [];
  const side: ParsedDeckLine[] = [];
  const skipped: string[] = [];
  let section: "main" | "side" | "ignore" = "main";
  let sawBlank = false;

  const push = (line: ParsedDeckLine) => {
    (section === "side" ? side : main).push(line);
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      sawBlank = true;
      continue;
    }
    const header = line.toLowerCase();
    if (header === "deck" || header === "mainboard" || header === "main") {
      section = "main";
      sawBlank = false;
      continue;
    }
    if (header === "sideboard" || header === "side") {
      section = "side";
      sawBlank = false;
      continue;
    }
    if (header === "commander" || header === "companion" || header === "about") {
      // Arena blocks we don't clinic (companion/commander/deck name meta).
      section = "ignore";
      sawBlank = false;
      continue;
    }
    const m = line.match(/^(\d+)\s*x?\s+(.+)$/i);
    if (!m) {
      // "Name My Cool Brew" follows an "About" header; anything else is noise.
      if (section !== "ignore") skipped.push(line);
      continue;
    }
    if (section === "ignore") {
      // Commander/companion card lines are not part of the 60 — skip until an
      // explicit Deck/Sideboard header resumes parsing.
      continue;
    }
    // MTGO/Goldfish style: no headers, blank line after a real mainboard
    // means the rest is the sideboard.
    if (sawBlank && section === "main" && main.reduce((n, c) => n + c.count, 0) >= 40) {
      section = "side";
    }
    sawBlank = false;
    const count = Math.max(1, Math.min(250, Number(m[1])));
    const name = stripSetSuffix(m[2]);
    if (name) push({ name, count });
  }

  return { main, side, skipped };
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
