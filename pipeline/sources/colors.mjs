/**
 * Archetype colors reconciled against the actual list.
 *
 * MTGGoldfish tiles carry the colors of the *archetype label*, while the list
 * we ship for that tile comes from a different source (MTGO / magic.gg /
 * Untapped ladder). When they disagree the label wins by default, which is how
 * a "Mono-White Lifegain" tile ended up shipping a list with four Ruin-Lurker
 * Bat ({B}) in it — and how the opponent read told players their black-mana
 * opponent was on mono-white.
 *
 * The cards are the ground truth. These helpers widen a tile's colors to cover
 * what the list actually plays and rename the archetype to match.
 */

const MONO_NAME = {
  W: "Mono-White",
  U: "Mono-Blue",
  B: "Mono-Black",
  R: "Mono-Red",
  G: "Mono-Green",
};

const PAIR_NAME = {
  WU: "Azorius",
  UB: "Dimir",
  BR: "Rakdos",
  RG: "Gruul",
  WG: "Selesnya",
  WB: "Orzhov",
  UR: "Izzet",
  BG: "Golgari",
  WR: "Boros",
  UG: "Simic",
};

const TRIO_NAME = {
  WUG: "Bant",
  WUB: "Esper",
  UBR: "Grixis",
  BRG: "Jund",
  WRG: "Naya",
  WBG: "Abzan",
  WUR: "Jeskai",
  UBG: "Sultai",
  WBR: "Mardu",
  URG: "Temur",
};

export const COLOR_ORDER = ["W", "U", "B", "R", "G"];

export function colorKey(colors) {
  const set = new Set(colors);
  return COLOR_ORDER.filter((c) => set.has(c)).join("");
}

/** "WB" → "Orzhov", "W" → "Mono-White", four+ → "4c"/"5c". */
export function colorGroupName(colors) {
  const key = colorKey(colors);
  if (!key) return null;
  if (key.length === 1) return MONO_NAME[key];
  if (key.length === 2) return PAIR_NAME[key] ?? null;
  if (key.length === 3) return TRIO_NAME[key] ?? null;
  return key.length === 4 ? "4c" : "5c";
}

const COLOR_WORDS = new Set(
  [
    ...Object.values(MONO_NAME),
    ...Object.values(PAIR_NAME),
    ...Object.values(TRIO_NAME),
    "4c",
    "5c",
    "Four-Color",
    "Five-Color",
  ].map((w) => w.toLowerCase()),
);

/** "Mono-White Lifegain" → "Lifegain"; null when there's no color word. */
export function archetypeTheme(name) {
  const parts = String(name || "").trim().split(/\s+/);
  if (parts.length < 2) return null;
  if (!COLOR_WORDS.has(parts[0].toLowerCase())) return null;
  const rest = parts.slice(1).join(" ").trim();
  return rest || null;
}

/**
 * Colors the mainboard actually plays. Lands are ignored (fixing lands say
 * little) and a color needs at least `minCopies` copies among nonland cards, so
 * one scraped stray can't repaint an archetype.
 */
export function listColorIdentity(mainboard, colorsOf, minCopies = 2) {
  const copies = new Map();
  for (const entry of mainboard || []) {
    if (entry.land) continue;
    const n = Number(entry.count) || 0;
    if (n <= 0) continue;
    for (const c of colorsOf(entry) || []) {
      if (!COLOR_ORDER.includes(c)) continue;
      copies.set(c, (copies.get(c) ?? 0) + n);
    }
  }
  return COLOR_ORDER.filter((c) => (copies.get(c) ?? 0) >= minCopies);
}

/**
 * Widen a tile's colors/name to cover what the list plays. Colors are only ever
 * added — a tile color the list happens not to show (a one-of splash trimmed
 * from this copy of the deck) stays, since the archetype still plays it.
 */
export function reconcileArchetype(tileName, tileColors, listColors) {
  const tile = (tileColors || []).filter((c) => COLOR_ORDER.includes(c));
  const list = (listColors || []).filter((c) => COLOR_ORDER.includes(c));
  const union = colorKey([...tile, ...list]).split("");
  const added = list.filter((c) => !tile.includes(c));
  const colors = union.length ? union : tile;
  if (!added.length || !tile.length) {
    return { name: tileName, colors, adjusted: false, added: [] };
  }
  const theme = archetypeTheme(tileName);
  const label = colorGroupName(union);
  if (!theme || !label) {
    return { name: tileName, colors, adjusted: false, added };
  }
  return { name: `${label} ${theme}`, colors, adjusted: true, added };
}
