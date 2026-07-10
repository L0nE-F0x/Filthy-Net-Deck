/**
 * Shared archetype + color heuristics for list assignment.
 */

// Multiversal Passage is rainbow — do NOT treat it as a mono-color signal.
// Starting Town is multi-color (WBR-ish); keep it on W/B/R only.
const LAND_W =
  /plains|sacred foundry|hallowed fountain|floodfarm|starting town|elegant parlor|sunbillow|inspirit|restless fortress|shadowy backstreet|lush portico|razorverge|seachrome|temple garden|godless shrine|concealed courtyard/;
const LAND_U =
  /island|steam vents|spirebluff|gloomlake|floodfarm|watery grave|hallowed fountain|breeding pool|otawara|restless reef|thundering falls|restless anchorage|meticulous archive/;
const LAND_B =
  /swamp|watery grave|shadowy|underground|bleachbone|blood crypt|godless shrine|restless cottage|starting town|concealed courtyard|undercity sewers/;
const LAND_R =
  /mountain|steam vents|blood crypt|thundering|sacred foundry|riverpyre|commercial district|starting town|rockface|sokenzan|inspiring vantage|blazemire/;
const LAND_G =
  /forest|overgrown|breeding pool|botanical|lush portico|temple garden|commercial district|restless vinestalk|misty rainforest|wastewood/;

/** Aggressive creature packages that should never be labeled as control. */
const AGGRO_CREATURE_RE =
  /dream beavers|raphael, the nightwatcher|leonardo, cutting edge|quicksilver, brash blur|hired claw|slickshot|emberheart|heartfire|monstrous rage|cool but rude|iron-shield elf|black widow|timeline culler|marauding mako|snarling gorehound|bloodghast/;

/** Control / interaction package for 4c Control. */
const CONTROL_ENGINE_RE =
  /stock up|consult the star charts|tablet of discovery|three steps ahead|no more lies|day of judgment|temporary lockdown|deadly cover-up|beza, the bounding spring/;

export function inferColorsFromCards(mainboard = []) {
  const colors = new Set();
  for (const c of mainboard) {
    const n = String(c.name || "").toLowerCase();
    // Skip pure rainbow / any-color utility lands that inflate identity
    if (/multiversal passage|fabled passage|cavern of souls|demolition field/.test(n))
      continue;
    if (LAND_W.test(n) || /\bplains\b/.test(n)) colors.add("W");
    if (LAND_U.test(n) || /\bisland\b/.test(n)) colors.add("U");
    if (LAND_B.test(n) || /\bswamp\b/.test(n)) colors.add("B");
    if (LAND_R.test(n) || /\bmountain\b/.test(n)) colors.add("R");
    if (LAND_G.test(n) || /\bforest\b/.test(n)) colors.add("G");
  }
  // Non-land color signals
  const blob = mainboard.map((c) => String(c.name || "").toLowerCase()).join(" | ");
  if (/slickshot|emberheart|monstrous rage|burst lightning|lightning helix|abrade|boros charm|sear\b/.test(blob))
    colors.add("R");
  if (/opt|sleight|stock up|consult|flood|counterspell|three steps|deduce|no more lies|negate/.test(blob))
    colors.add("U");
  if (/duress|thoughtseize|cut down|go for the throat|sheoldred|kaito|requiting|strategic betrayal|inevitable defeat/.test(blob))
    colors.add("B");
  if (/lay down arms|get lost|temporary lockdown|sunfall|day of judgment|sheltered by ghosts|no more lies/.test(blob))
    colors.add("W");
  if (/llanowar|bushwhack|overprotect|trailblazer|questing druid|bristly bill|badgermole/.test(blob))
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

/** Rough non-land creature density (0–1) from qty-weighted name heuristics. */
export function creatureDensity(mainboard = []) {
  const creatureish =
    /avatar|beast|elf|dragon|spider|knight|angel|demon|goblin|human|cat|dog|dinosaur|hydra|elemental|horror|zombie|vampire|soldier|warrior|monk|wizard|rogue|cleric|shaman|drake|phoenix|ooze|insect|bear|bird|mermaid|mutant|ninja|turtle|hero|spy|widow|curator|siren|preacher|sheoldred|kaito|beza|emperor|wandering|ouroboroid|overlord|badgermole|llanowar|slickshot|emberheart|hired claw|dream beavers|raphael|leonardo|quicksilver|cool but rude|iron-shield|black widow|timeline culler|marauding|bloodghast|gorehound|north wind/;
  let total = 0;
  let creatures = 0;
  for (const c of mainboard) {
    const n = (c.count || 0);
    total += n;
    const name = String(c.name || "").toLowerCase();
    if (
      /plains|island|swamp|mountain|forest|verge|foundry|crypt|shrine|fountain|vents|passage|town|courtyard|vantage|sewers|archive|falls|anchorage|otawara|eiganjo|starting town|multiversal|cavern|demolition|fabled|restless|steam|breeding|watery|godless|concealed|inspiring|sacred|blood crypt|gloomlake|floodfarm|thundering|meticulous|shadowy|raucous|undercity/.test(
        name,
      )
    ) {
      continue; // land
    }
    if (creatureish.test(name)) creatures += n;
  }
  return total ? creatures / total : 0;
}

export function guessArchetype(mainboard = []) {
  const names = mainboard.map((c) => c.name.toLowerCase()).join(" | ");
  const has = (re) => re.test(names);
  const colors = inferColorsFromCards(mainboard);
  const col = colors.join("");
  const creat = creatureDensity(mainboard);

  if (has(/badgermole|ouroboroid/) && has(/practiced offense|brightglass|forest|plains/))
    return "Selesnya Ouroboroid";
  if (has(/gearhulk|brightglass gearhulk/) && has(/forest|plains/) && !has(/ouroboroid/))
    return "Selesnya Gearhulk";
  if (
    has(/fear of missing out|cori-steel|emberheart|slickshot/) &&
    has(/island|steam vents|spirebluff|riverpyre/)
  )
    return "Izzet Prowess";
  if (
    has(/eddymurk|hearth elemental|sunderflock|flow state/) &&
    has(/island|mountain|steam vents|spirebluff/)
  )
    return "Izzet Spellementals";

  // Jeskai Lessons = lessons package, not merely Tablet (4c Control also runs Tablet)
  if (
    has(/accumulate wisdom|firebending lesson|abandon attachments|combustion technique/) &&
    has(/jeskai revelation|tablet of discovery|stock up/)
  )
    return "Jeskai Lessons";

  // 4c Control: removal + control engines, multi-color, low creature density.
  // Do NOT label creature-heavy Mardu/TMNT piles that happen to run Inevitable Defeat.
  if (
    has(/inevitable defeat/) &&
    has(CONTROL_ENGINE_RE) &&
    colors.length >= 3 &&
    creat < 0.22 &&
    !has(AGGRO_CREATURE_RE) &&
    !has(/boros charm/)
  )
    return "4c Control";

  // Soft 4c: Consult + Stock Up multi-color control without aggro creatures
  if (
    has(/consult the star charts/) &&
    has(/stock up|tablet of discovery|no more lies/) &&
    colors.length >= 3 &&
    creat < 0.2 &&
    !has(AGGRO_CREATURE_RE)
  )
    return "4c Control";

  if (
    has(/temporary lockdown|day of judgment|sunfall|beza|fountainport|stock up/) &&
    col.includes("W") &&
    col.includes("U") &&
    !col.includes("B") &&
    creat < 0.25
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
  if (
    has(/bristly bill|landfall|scute swarm|lotus cobra|travelinga/) ||
    (has(/bushwhack|overprotect/) && colors.length === 1 && col.includes("G"))
  )
    return "Mono-Green Landfall";
  if (has(/scavenging ooze|llanowar|questing druid/) && colors.length <= 2)
    return "Mono-Green";
  if (has(/reanimator|zombify|valgavoth|pitiless carnage/)) return "Reanimator";
  if (has(/phoenix|arclight|treasure cruise|ledger shredder/)) return "Izzet Phoenix";
  if (
    has(/rakdos|fable of the mirror|bloodtithe|sheoldred/) &&
    col.includes("B") &&
    col.includes("R")
  )
    return "Rakdos Midrange";
  if (has(/omniscience|show and tell|kona, rescue/)) return "Omniscience";

  // Don't invent a weak "MTGO deck (UB)" label that pollutes fuzzy matching —
  // leave unnamed so only color-matched assignment can use it.
  return null;
}

/**
 * Does this list actually belong on the target archetype shell?
 * Prevents e.g. Mardu TMNT aggro (Inevitable Defeat + creatures) overwriting 4c Control.
 * Returns 0–1; callers should require >= 0.55 for named archetypes with signatures.
 */
export function listFitsArchetype(targetName, mainboard = []) {
  const target = String(targetName || "").toLowerCase();
  if (!target || !mainboard?.length) return 0.5;

  const names = mainboard.map((c) => String(c.name || "").toLowerCase()).join(" | ");
  const has = (re) => re.test(names);
  const creat = creatureDensity(mainboard);
  const guessed = guessArchetype(mainboard);

  // Hard reject known poison pills for control shells
  if (/control|4c|azorius|jeskai lessons/.test(target)) {
    if (has(AGGRO_CREATURE_RE) && creat > 0.18) return 0.05;
    if (has(/boros charm|hired claw|marauding mako/) && !has(CONTROL_ENGINE_RE))
      return 0.1;
  }

  if (/4c control|four.color control|wubr control/.test(target)) {
    if (!has(/inevitable defeat|consult the star charts/)) return 0.15;
    if (!has(CONTROL_ENGINE_RE)) return 0.2;
    if (creat >= 0.22) return 0.1;
    if (has(AGGRO_CREATURE_RE)) return 0.05;
    if (guessed === "4c Control") return 1;
    return 0.75;
  }

  if (/jeskai lessons/.test(target)) {
    if (has(/accumulate wisdom|firebending lesson|abandon attachments/)) return 0.95;
    if (has(/jeskai revelation/) && has(/tablet of discovery|stock up/)) return 0.7;
    return 0.2;
  }

  if (/izzet prowess/.test(target)) {
    if (has(/slickshot|emberheart|fear of missing out|cori-steel/)) return 0.9;
    return guessed === "Izzet Prowess" ? 0.85 : 0.25;
  }

  if (/izzet spellement/.test(target)) {
    if (has(/eddymurk|hearth elemental|sunderflock|flow state/)) return 0.9;
    return guessed === "Izzet Spellementals" ? 0.85 : 0.25;
  }

  if (/selesnya|ouroboroid/.test(target)) {
    if (has(/ouroboroid|badgermole|practiced offense/)) return 0.9;
    return guessed?.includes("Selesnya") ? 0.8 : 0.25;
  }

  if (/dimir/.test(target)) {
    if (has(/kaito|deceit|excruciator|requiting hex|superior spider/)) return 0.85;
    return guessed?.includes("Dimir") ? 0.8 : 0.3;
  }

  if (/mono-?red|red aggro/.test(target)) {
    if (has(/slickshot|emberheart|monstrous rage|hired claw/) && !has(/island|steam vents/))
      return 0.9;
    return 0.3;
  }

  // Generic: prefer matching guess; unnamed lists get a soft pass only if colors ok (caller checks)
  if (guessed) {
    const g = guessed.toLowerCase();
    if (g === target || target.includes(g) || g.includes(target)) return 0.9;
    // partial token overlap
    const gt = new Set(g.split(/[^a-z0-9]+/).filter(Boolean));
    const tt = target.split(/[^a-z0-9]+/).filter(Boolean);
    let hit = 0;
    for (const t of tt) if (gt.has(t)) hit++;
    const ratio = tt.length ? hit / tt.length : 0;
    if (ratio >= 0.5) return 0.7;
    return 0.2;
  }

  return 0.45; // unknown list — neutral-low; color filter still applies
}
