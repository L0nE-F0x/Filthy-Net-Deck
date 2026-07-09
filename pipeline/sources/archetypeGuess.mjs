/**
 * Shared archetype + color heuristics for list assignment.
 */

const LAND_W =
  /plains|sacred foundry|hallowed fountain|floodfarm|starting town|elegant parlor|sunbillow|inspirit|restless fortress|shadowy backstreet|lush portico|razorverge|seachrome|temple garden/;
const LAND_U =
  /island|steam vents|spirebluff|gloomlake|floodfarm|watery grave|hallowed fountain|breeding pool|otawara|restless reef|thundering falls|multiversal passage/;
const LAND_B =
  /swamp|watery grave|shadowy|underground|bleachbone|blood crypt|godless shrine|restless cottage|starting town/;
const LAND_R =
  /mountain|steam vents|blood crypt|thundering|sacred foundry|riverpyre|commercial district|starting town|rockface|sokenzan/;
const LAND_G =
  /forest|overgrown|breeding pool|botanical|lush portico|temple garden|commercial district|restless vinestalk|misty rainforest/;

export function inferColorsFromCards(mainboard = []) {
  const colors = new Set();
  for (const c of mainboard) {
    const n = String(c.name || "").toLowerCase();
    if (LAND_W.test(n) || /\bplains\b/.test(n)) colors.add("W");
    if (LAND_U.test(n) || /\bisland\b/.test(n)) colors.add("U");
    if (LAND_B.test(n) || /\bswamp\b/.test(n)) colors.add("B");
    if (LAND_R.test(n) || /\bmountain\b/.test(n)) colors.add("R");
    if (LAND_G.test(n) || /\bforest\b/.test(n)) colors.add("G");
  }
  // Non-land color signals
  const blob = mainboard.map((c) => String(c.name || "").toLowerCase()).join(" | ");
  if (/slickshot|emberheart|monstrous rage|burst lightning|lightning helix|abra de|abrade/.test(blob))
    colors.add("R");
  if (/opt|sleight|stock up|consult|flood|counterspell|three steps|deduce/.test(blob))
    colors.add("U");
  if (/duress|thoughtseize|cut down|go for the throat|sheoldred|kaito|requiting/.test(blob))
    colors.add("B");
  if (/lay down arms|get lost|temporary lockdown|sunfall|day of judgment|sheltered by ghosts/.test(blob))
    colors.add("W");
  if (/llanowar|bushwhack|overprotect|trailblazer|questing druid|bristly bill/.test(blob))
    colors.add("G");
  return [...colors];
}

/**
 * Color compatibility 0–1.
 * Rejects e.g. UB Dimir list on WUBR 4c Control shell.
 */
export function colorCompatibility(deckColors = [], listColors = []) {
  const d = new Set(deckColors.filter((c) => c && c !== "C"));
  const l = new Set(listColors.filter((c) => c && c !== "C"));
  if (!d.size || !l.size) return 0.5; // unknown — neutral
  let hit = 0;
  for (const c of l) if (d.has(c)) hit++;
  const precision = hit / l.size; // list colors mostly inside deck
  const recall = hit / d.size; // deck colors covered by list
  // Dimir (UB) on 4c (WUBR): precision=1, recall=0.5 → still high; penalize missing colors
  const missing = [...d].filter((c) => !l.has(c)).length;
  const extra = [...l].filter((c) => !d.has(c)).length;
  // 4c shell needs multi-color list
  if (d.size >= 3 && l.size <= 2) return 0.15;
  if (d.size === 1 && l.size >= 3) return 0.2;
  if (extra >= 2) return Math.min(0.35, precision * 0.5);
  return Math.max(0, precision * 0.55 + recall * 0.35 - missing * 0.08);
}

export function guessArchetype(mainboard = []) {
  const names = mainboard.map((c) => c.name.toLowerCase()).join(" | ");
  const has = (re) => re.test(names);
  const colors = inferColorsFromCards(mainboard);
  const col = colors.join("");

  if (has(/badgermole|brightglass|ouroboroid|practiced offense/))
    return "Selesnya Ouroboroid";
  if (has(/gearhulk|brightglass gearhulk/) && has(/forest|plains/))
    return "Selesnya Gearhulk";
  if (
    has(/fear of missing out|cori-steel|emberheart|slickshot/) &&
    has(/island|steam vents|spirebluff|riverpyre/)
  )
    return "Izzet Prowess";
  if (has(/spellemental|hydroelectric|elemental bond|roiling vortex/) && has(/island|mountain/))
    return "Izzet Spellementals";
  if (has(/accumulate wisdom|jeskai revelation|tablet of discovery|firebending lesson/))
    return "Jeskai Lessons";
  if (
    has(/inevitable defeat|stock up|consult the star charts/) &&
    colors.length >= 3
  )
    return "4c Control";
  if (
    has(/temporary lockdown|day of judgment|sunfall|beza|fountainport|stock up/) &&
    col.includes("W") &&
    col.includes("U") &&
    !col.includes("B")
  )
    return "Azorius Control";
  if (
    has(/winternight stories|requiting hex|kaito|enduring curiosity|go for the throat/) &&
    col.includes("U") &&
    col.includes("B") &&
    !col.includes("W")
  )
    return "Dimir Midrange";
  if (has(/excruciator|superior spider|deceit/) && col.includes("U") && col.includes("B"))
    return "Dimir Excruciator";
  if (has(/domain|up the beanstalk|herd migration|leyline binding/)) return "Domain";
  if (has(/monstrous rage|slickshot|emberheart|scorching shot/) && !col.includes("U"))
    return "Mono-Red Aggro";
  if (has(/bristly bill|landfall|scute swarm|lotus cobra|travelinga/) || (has(/bushwhack|overprotect/) && col.length === 1 && col.includes("G")))
    return "Mono-Green Landfall";
  if (has(/scavenging ooze|llanowar|questing druid/) && col.length <= 2)
    return "Mono-Green";
  if (has(/reanimator|zombify|valgavoth|pitiless carnage/)) return "Reanimator";
  if (has(/phoenix|arclight|treasure cruise|ledger shredder/)) return "Izzet Phoenix";
  if (has(/rakdos|fable of the mirror|bloodtithe|sheoldred/) && col.includes("B") && col.includes("R"))
    return "Rakdos Midrange";
  if (has(/omniscience|show and tell/)) return "Omniscience";

  // Don't invent a weak "MTGO deck (UB)" label that pollutes fuzzy matching —
  // leave unnamed so only color-matched assignment can use it.
  return null;
}
