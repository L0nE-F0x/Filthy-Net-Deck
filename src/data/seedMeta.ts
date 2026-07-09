import { buildArenaImport } from "../services/arenaImport";
import type {
  CardEntry,
  Deck,
  FormatId,
  FormatMeta,
  ManaColor,
  MetaBundle,
  PlayMode,
  TournamentResult,
} from "../types/meta";

function c(count: number, name: string): CardEntry {
  return { count, name };
}

type ArchetypeDef = {
  name: string;
  colors: ManaColor[];
  tier: 1 | 2 | 3;
  metaShare: number;
  description: string;
  mainboard: CardEntry[];
  sideboard?: CardEntry[];
  commander?: string;
};

/** 8 archetypes per format — full lists for top shells, lean lists for the rest */
const ARCHETYPES: Record<FormatId, ArchetypeDef[]> = {
  standard: [
    {
      name: "Dimir Midrange",
      colors: ["U", "B"],
      tier: 1,
      metaShare: 16.8,
      description: "Disruption + efficient threats. Best overall Bo3 shell and strong Bo1 with slight tweaks.",
      mainboard: [
        c(4, "Deep-Cavern Bat"), c(4, "Preacher of the Schism"), c(3, "Sheoldred, the Apocalypse"),
        c(3, "Tishana's Tidebinder"), c(2, "Aclazotz, Deepest Betrayal"), c(4, "Go for the Throat"),
        c(3, "Cut Down"), c(3, "Negate"), c(2, "Three Steps Ahead"), c(2, "Duress"),
        c(2, "Gix's Command"), c(4, "Darkslick Shores"), c(4, "Underground River"),
        c(4, "Restless Reef"), c(3, "Gloomlake Verge"), c(4, "Island"), c(5, "Swamp"),
        c(2, "Undercity Sewers"), c(2, "The End"),
      ],
      sideboard: [
        c(2, "Ghost Vacuum"), c(2, "Anoint with Affliction"), c(2, "Disdainful Stroke"),
        c(2, "Negate"), c(2, "Gix's Command"), c(2, "Tishana's Tidebinder"), c(2, "Duress"), c(1, "Aclazotz, Deepest Betrayal"),
      ],
    },
    {
      name: "Izzet Prowess",
      colors: ["U", "R"],
      tier: 1,
      metaShare: 14.2,
      description: "Bo1 ladder king: cantrips, prowess threats, and lethal reach.",
      mainboard: [
        c(4, "Slickshot Show-Off"), c(4, "Monastery Swiftspear"), c(3, "Stormcatch Mentor"),
        c(4, "Consider"), c(4, "Opt"), c(4, "Play with Fire"), c(3, "Lightning Strike"),
        c(3, "Sleight of Hand"), c(2, "Stock Up"), c(2, "Torch the Tower"),
        c(2, "Into the Flood Maw"), c(2, "This Town Ain't Big Enough"), c(4, "Spirebluff Canal"),
        c(4, "Shivan Reef"), c(4, "Island"), c(6, "Mountain"), c(2, "Thundering Falls"), c(3, "Restless Spire"),
      ],
    },
    {
      name: "Domain Control",
      colors: ["W", "U", "B", "R", "G"],
      tier: 1,
      metaShare: 11.5,
      description: "Overlord value and domain payoff — grinds midrange into dust.",
      mainboard: [
        c(4, "Leyline Binding"), c(3, "Herigast, Erupting Nullkite"), c(2, "Atraxa, Grand Unifier"),
        c(3, "Up the Beanstalk"), c(3, "Stock Up"), c(2, "Three Steps Ahead"), c(2, "Get Lost"),
        c(2, "Negate"), c(4, "Commercial District"), c(4, "Hedge Maze"), c(3, "Lush Portico"),
        c(3, "Meticulous Archive"), c(2, "Shadowy Backstreet"), c(2, "Undercity Sewers"),
        c(2, "Thundering Falls"), c(2, "Raucous Theater"), c(2, "Island"), c(2, "Plains"),
        c(2, "Forest"), c(2, "Swamp"), c(1, "Mountain"), c(2, "Floodfarm Verge"),
        c(2, "Gloomlake Verge"), c(2, "Temporary Lockdown"),
      ],
      sideboard: [c(2, "Negate"), c(2, "Rest in Peace"), c(2, "Duress"), c(2, "Get Lost"), c(2, "Disdainful Stroke"), c(2, "Beza, the Bounding Spring"), c(2, "Tishana's Tidebinder"), c(1, "Atraxa, Grand Unifier")],
    },
    {
      name: "Boros Aggro",
      colors: ["W", "R"],
      tier: 2,
      metaShare: 9.4,
      description: "Fast curve, reach, and Initiative-style pressure for BO1 queues.",
      mainboard: [
        c(4, "Heartfire Hero"), c(4, "Monastery Swiftspear"), c(4, "Slickshot Show-Off"),
        c(3, "Emberheart Challenger"), c(4, "Play with Fire"), c(3, "Lightning Strike"),
        c(3, "Burst Lightning"), c(2, "Get Lost"), c(2, "Sheltered by Ghosts"),
        c(4, "Inspiring Vantage"), c(4, "Sacred Foundry"), c(3, "Battlefield Forge"),
        c(4, "Mountain"), c(4, "Plains"), c(3, "Restless Bivouac"), c(3, "Rockface Village"),
        c(2, "Sundown Pass"),
      ],
    },
    {
      name: "Golgari Midrange",
      colors: ["B", "G"],
      tier: 2,
      metaShare: 8.1,
      description: "Value creatures and grind engines for fair Standard mirrors.",
      mainboard: [
        c(4, "Llanowar Elves"), c(4, "Deep-Cavern Bat"), c(3, "Preacher of the Schism"),
        c(3, "Glissa Sunslayer"), c(2, "Sheoldred, the Apocalypse"), c(3, "Go for the Throat"),
        c(3, "Cut Down"), c(2, "Duress"), c(2, "Gix's Command"), c(2, "The End"),
        c(4, "Blooming Marsh"), c(4, "Llanowar Wastes"), c(3, "Restless Cottage"),
        c(3, "Wastewood Verge"), c(4, "Forest"), c(5, "Swamp"), c(2, "Boseiju, Who Endures"),
        c(3, "Scrapshooter"),
      ],
    },
    {
      name: "Azorius Control",
      colors: ["W", "U"],
      tier: 2,
      metaShare: 7.2,
      description: "Permission, sweepers, and hard-to-answer endgames.",
      mainboard: [
        c(4, "No More Lies"), c(3, "Three Steps Ahead"), c(3, "Get Lost"), c(2, "Temporary Lockdown"),
        c(3, "Stock Up"), c(2, "Beza, the Bounding Spring"), c(2, "The Wandering Emperor"),
        c(3, "Deduce"), c(2, "Horned Loch-Whale"), c(4, "Adarkar Wastes"), c(4, "Seachrome Coast"),
        c(4, "Restless Anchorage"), c(3, "Floodfarm Verge"), c(4, "Island"), c(4, "Plains"),
        c(2, "Meticulous Archive"), c(3, "Consider"), c(2, "Tishana's Tidebinder"),
      ],
      sideboard: [c(2, "Negate"), c(2, "Rest in Peace"), c(2, "Disdainful Stroke"), c(2, "Beza, the Bounding Spring"), c(2, "Get Lost"), c(2, "Ghost Vacuum"), c(2, "Tishana's Tidebinder"), c(1, "The Wandering Emperor")],
    },
    {
      name: "Mono-Red Aggro",
      colors: ["R"],
      tier: 3,
      metaShare: 6.0,
      description: "Pure speed — punish slow hands on the Bo1 ladder.",
      mainboard: [
        c(4, "Monastery Swiftspear"), c(4, "Heartfire Hero"), c(4, "Slickshot Show-Off"),
        c(4, "Play with Fire"), c(4, "Lightning Strike"), c(3, "Burst Lightning"),
        c(3, "Witchstalker Frenzy"), c(2, "Screaming Nemesis"), c(20, "Mountain"),
        c(4, "Rockface Village"), c(4, "Den of the Bugbear"), c(4, "Emberheart Challenger"),
      ],
    },
    {
      name: "Esper Pixie",
      colors: ["W", "U", "B"],
      tier: 3,
      metaShare: 5.1,
      description: "Bounce and cheap interaction — tricky and resilient.",
      mainboard: [
        c(4, "Hopeless Nightmare"), c(4, "This Town Ain't Big Enough"), c(4, "Stormchaser's Talent"),
        c(3, "Fear of Isolation"), c(3, "Deep-Cavern Bat"), c(3, "Go for the Throat"),
        c(2, "Get Lost"), c(2, "No More Lies"), c(2, "Kaito, Bane of Nightmares"),
        c(4, "Darkslick Shores"), c(3, "Seachrome Coast"), c(3, "Caves of Koilos"),
        c(3, "Restless Anchorage"), c(2, "Restless Reef"), c(3, "Island"), c(3, "Swamp"),
        c(2, "Plains"), c(2, "Floodfarm Verge"), c(2, "Gloomlake Verge"), c(2, "Shadowy Backstreet"),
        c(2, "Stock Up"),
      ],
    },
  ],
  alchemy: [
    { name: "Azorius Tempo", colors: ["W", "U"], tier: 1, metaShare: 13, description: "Flash threats and bounce for Alchemy Bo1.", mainboard: [c(4, "Spyglass Siren"), c(4, "Deep-Cavern Bat"), c(3, "Tishana's Tidebinder"), c(3, "Steel Seraph"), c(4, "No More Lies"), c(3, "Get Lost"), c(3, "Three Steps Ahead"), c(2, "Temporary Lockdown"), c(3, "Wedding Announcement"), c(2, "The Wandering Emperor"), c(4, "Adarkar Wastes"), c(4, "Seachrome Coast"), c(4, "Restless Anchorage"), c(3, "Floodfarm Verge"), c(4, "Island"), c(4, "Plains"), c(2, "Meticulous Archive"), c(4, "Consider")] },
    { name: "Grixis Control", colors: ["U", "B", "R"], tier: 1, metaShare: 11, description: "Flexible answers for Alchemy Bo3 events.", mainboard: [c(3, "Sheoldred, the Apocalypse"), c(2, "Atraxa, Grand Unifier"), c(4, "Go for the Throat"), c(3, "Torch the Tower"), c(3, "Negate"), c(2, "Three Steps Ahead"), c(2, "Duress"), c(2, "Brotherhood's End"), c(2, "Deadly Cover-Up"), c(3, "Stock Up"), c(4, "Darkslick Shores"), c(3, "Blackcleave Cliffs"), c(3, "Spirebluff Canal"), c(3, "Underground River"), c(2, "Shivan Reef"), c(3, "Island"), c(3, "Swamp"), c(2, "Mountain"), c(2, "Xander's Lounge"), c(3, "Consider"), c(2, "The End"), c(2, "Restless Reef")], sideboard: [c(2, "Ghost Vacuum"), c(2, "Disdainful Stroke"), c(2, "Negate"), c(2, "Duress"), c(2, "Brotherhood's End"), c(2, "Tishana's Tidebinder"), c(1, "Sheoldred, the Apocalypse"), c(2, "Get Lost")] },
    { name: "Rakdos Midrange", colors: ["B", "R"], tier: 2, metaShare: 10, description: "Aggressive midrange with strong removal.", mainboard: [c(4, "Bloodtithe Harvester"), c(4, "Deep-Cavern Bat"), c(3, "Fable of the Mirror-Breaker"), c(3, "Sheoldred, the Apocalypse"), c(4, "Go for the Throat"), c(3, "Cut Down"), c(3, "Torch the Tower"), c(2, "Duress"), c(4, "Blackcleave Cliffs"), c(4, "Sulfurous Springs"), c(3, "Restless Vents"), c(4, "Swamp"), c(4, "Mountain"), c(3, "Blightstep Pathway"), c(2, "Takenuma, Abandoned Mire"), c(2, "Screaming Nemesis"), c(2, "Gix's Command"), c(2, "Den of the Bugbear")] },
    { name: "Selesnya Midrange", colors: ["W", "G"], tier: 2, metaShare: 9, description: "Creatures and combat tricks for Alchemy.", mainboard: [c(4, "Llanowar Elves"), c(4, "Pawpatch Recruit"), c(3, "Brightglass Gearhulk"), c(3, "Beza, the Bounding Spring"), c(3, "Get Lost"), c(2, "Sheltered by Ghosts"), c(2, "Temporary Lockdown"), c(3, "Collector's Cage"), c(4, "Brushland"), c(4, "Razorverge Thicket"), c(3, "Restless Prairie"), c(4, "Forest"), c(4, "Plains"), c(2, "Boseiju, Who Endures"), c(3, "Llanowar Elves"), c(2, "Overlord of the Hauntwoods"), c(2, "Overlord of the Mistmoors"), c(2, "Hushwood Verge")] },
    { name: "Izzet Spells", colors: ["U", "R"], tier: 2, metaShare: 8, description: "Spell-heavy tempo for digital-only tools.", mainboard: [c(4, "Slickshot Show-Off"), c(4, "Consider"), c(4, "Opt"), c(4, "Play with Fire"), c(3, "Lightning Strike"), c(3, "Stock Up"), c(2, "Three Steps Ahead"), c(4, "Spirebluff Canal"), c(4, "Shivan Reef"), c(4, "Island"), c(5, "Mountain"), c(3, "Restless Spire"), c(3, "Monastery Swiftspear"), c(2, "Torch the Tower"), c(3, "Stormcatch Mentor"), c(2, "Thundering Falls"), c(2, "Into the Flood Maw")] },
    { name: "Dimir Bounce", colors: ["U", "B"], tier: 3, metaShare: 7, description: "Bounce loops and discard pressure.", mainboard: [c(4, "Hopeless Nightmare"), c(4, "This Town Ain't Big Enough"), c(4, "Deep-Cavern Bat"), c(3, "Fear of Isolation"), c(3, "Go for the Throat"), c(2, "Negate"), c(2, "Kaito, Bane of Nightmares"), c(4, "Darkslick Shores"), c(4, "Underground River"), c(3, "Restless Reef"), c(4, "Island"), c(4, "Swamp"), c(3, "Stormchaser's Talent"), c(2, "Cut Down"), c(2, "Gloomlake Verge"), c(2, "Undercity Sewers"), c(2, "Stock Up"), c(2, "Tishana's Tidebinder")] },
    { name: "Mono-Red", colors: ["R"], tier: 3, metaShare: 6, description: "Linear aggro for Alchemy Bo1.", mainboard: [c(4, "Monastery Swiftspear"), c(4, "Heartfire Hero"), c(4, "Slickshot Show-Off"), c(4, "Play with Fire"), c(4, "Lightning Strike"), c(3, "Burst Lightning"), c(20, "Mountain"), c(4, "Emberheart Challenger"), c(4, "Rockface Village"), c(3, "Screaming Nemesis"), c(3, "Witchstalker Frenzy"), c(3, "Den of the Bugbear")] },
    { name: "Orzhov Midrange", colors: ["W", "B"], tier: 3, metaShare: 5, description: "Bats and removal for fair Alchemy.", mainboard: [c(4, "Deep-Cavern Bat"), c(4, "Preacher of the Schism"), c(3, "Sheoldred, the Apocalypse"), c(3, "Go for the Throat"), c(3, "Cut Down"), c(2, "Get Lost"), c(2, "Temporary Lockdown"), c(4, "Caves of Koilos"), c(4, "Concealed Courtyard"), c(3, "Restless Fortress"), c(4, "Swamp"), c(4, "Plains"), c(2, "Shadowy Backstreet"), c(2, "Beza, the Bounding Spring"), c(2, "Duress"), c(2, "The End"), c(2, "Gix's Command"), c(2, "Anoint with Affliction")] },
  ],
  historic: [
    { name: "Jeskai Control", colors: ["W", "U", "R"], tier: 1, metaShare: 11, description: "Sweepers, counters, Teferi endgame.", mainboard: [c(4, "Expressive Iteration"), c(3, "Memory Deluge"), c(3, "Supreme Verdict"), c(2, "Wrath of God"), c(4, "No More Lies"), c(3, "Dovin's Veto"), c(2, "Lightning Helix"), c(2, "Get Lost"), c(3, "The Wandering Emperor"), c(2, "Teferi, Hero of Dominaria"), c(4, "Hallowed Fountain"), c(4, "Steam Vents"), c(3, "Sacred Foundry"), c(3, "Raugrin Triome"), c(2, "Deserted Beach"), c(2, "Stormcarved Coast"), c(2, "Island"), c(1, "Plains"), c(1, "Mountain"), c(2, "Otawara, Soaring City"), c(2, "Hengegate Pathway"), c(2, "Riverglide Pathway"), c(2, "Needleverge Pathway"), c(1, "Shark Typhoon")] },
    { name: "Jund Midrange", colors: ["B", "R", "G"], tier: 1, metaShare: 10, description: "Ragavan, Fable, remove everything.", mainboard: [c(4, "Ragavan, Nimble Pilferer"), c(4, "Deathrite Shaman"), c(3, "Bloodtithe Harvester"), c(3, "Fable of the Mirror-Breaker"), c(2, "Sheoldred, the Apocalypse"), c(4, "Thoughtseize"), c(3, "Fatal Push"), c(2, "Abrade"), c(2, "Kolaghan's Command"), c(2, "Wrenn and Six"), c(4, "Blood Crypt"), c(4, "Overgrown Tomb"), c(3, "Stomping Ground"), c(3, "Blackcleave Cliffs"), c(2, "Blooming Marsh"), c(2, "Takenuma, Abandoned Mire"), c(1, "Boseiju, Who Endures"), c(2, "Swamp"), c(1, "Mountain"), c(1, "Forest"), c(2, "Glorybringer"), c(2, "Ziatora's Proving Ground"), c(2, "Copperline Gorge")], sideboard: [c(2, "Duress"), c(2, "Haywire Mite"), c(2, "Unlicensed Hearse"), c(2, "Culling Ritual"), c(2, "Klothys, God of Destiny"), c(2, "Extinction Event"), c(1, "Glorybringer"), c(2, "Pithing Needle")] },
    { name: "Izzet Creativity", colors: ["U", "R"], tier: 2, metaShare: 9, description: "Creativity into Worldspine / Indomitable Creativity lines.", mainboard: [c(4, "Fable of the Mirror-Breaker"), c(4, "Expressive Iteration"), c(3, "Indomitable Creativity"), c(2, "Worldspine Wurm"), c(4, "Spirebluff Canal"), c(4, "Steam Vents"), c(3, "Riverglide Pathway"), c(4, "Island"), c(4, "Mountain"), c(3, "Consider"), c(3, "Lightning Bolt"), c(2, "Prismari Command"), c(2, "Big Score"), c(2, "Magmatic Channeler"), c(2, "Stormcarved Coast"), c(2, "Otawara, Soaring City"), c(2, "Sokenzan, Crucible of Defiance"), c(2, "Hard Evidence"), c(2, "Fable of the Mirror-Breaker"), c(2, "Fire // Ice")] },
    { name: "Creatures Toolbox", colors: ["G"], tier: 2, metaShare: 8, description: "Collected Company and utility creatures.", mainboard: [c(4, "Collected Company"), c(4, "Elvish Mystic"), c(4, "Llanowar Elves"), c(3, "Scavenging Ooze"), c(3, "Knight of Autumn"), c(2, "Elder Gargaroth"), c(4, "Forest"), c(4, "Boseiju, Who Endures"), c(3, "Lair of the Hydra"), c(3, "Branchloft Pathway"), c(2, "Temple Garden"), c(2, "Overgrown Tomb"), c(2, "Selfless Savior"), c(2, "Skyclave Apparition"), c(2, "Elite Spellbinder"), c(2, "Reidane, God of the Worthy"), c(2, "Yorion, Sky Nomad"), c(2, "Chord of Calling"), c(2, "Esika's Chariot"), c(2, "Tangled Florahedron")] },
    { name: "Affinity", colors: ["C"], tier: 2, metaShare: 7, description: "Artifact swarm with Thought Monitor.", mainboard: [c(4, "Thought Monitor"), c(4, "Thoughtcast"), c(4, "Ornithopter"), c(4, "Memnite"), c(4, "Springleaf Drum"), c(3, "Nettlecyst"), c(3, "Metallic Rebuke"), c(4, "Darksteel Citadel"), c(4, "Treasure Vault"), c(3, "Otawara, Soaring City"), c(2, "Island"), c(4, "Sojourner's Companion"), c(2, "Cranial Plating"), c(2, "Shadowspear"), c(2, "Portable Hole"), c(3, "Gingerbrute"), c(2, "Metallic Rebuke"), c(2, "Urza's Saga")] },
    { name: "Storm", colors: ["U", "R"], tier: 3, metaShare: 6, description: "Ritual into grapeshot-style finishes.", mainboard: [c(4, "Consider"), c(4, "Opt"), c(4, "Strike It Rich"), c(3, "Jeska's Will"), c(3, "Aetherflux Reservoir"), c(2, "Grapeshot"), c(4, "Spirebluff Canal"), c(4, "Steam Vents"), c(4, "Island"), c(4, "Mountain"), c(3, "Expressive Iteration"), c(3, "Big Score"), c(2, "Prismari Command"), c(2, "Stormcarved Coast"), c(2, "Otawara, Soaring City"), c(2, "Sokenzan, Crucible of Defiance"), c(2, "Underworld Breach"), c(2, "Brain Freeze"), c(2, "Mox Amber")] },
    { name: "Azorius Control", colors: ["W", "U"], tier: 3, metaShare: 5.5, description: "Classic UW control for Historic.", mainboard: [c(4, "Memory Deluge"), c(3, "Supreme Verdict"), c(4, "No More Lies"), c(3, "Dovin's Veto"), c(3, "The Wandering Emperor"), c(2, "Teferi, Hero of Dominaria"), c(4, "Hallowed Fountain"), c(4, "Hengegate Pathway"), c(3, "Deserted Beach"), c(4, "Island"), c(3, "Plains"), c(2, "Otawara, Soaring City"), c(2, "Eiganjo, Seat of the Empire"), c(2, "Get Lost"), c(2, "Shark Typhoon"), c(2, "Farewell"), c(2, "Absorb"), c(2, "Field of Ruin"), c(2, "Hall of Storm Giants"), c(1, "Castle Ardenvale")] },
    { name: "Rakdos Arcanist", colors: ["B", "R"], tier: 3, metaShare: 5, description: "Dreadhorde Arcanist grind package.", mainboard: [c(4, "Dreadhorde Arcanist"), c(4, "Ragavan, Nimble Pilferer"), c(4, "Thoughtseize"), c(4, "Fatal Push"), c(3, "Lightning Bolt"), c(3, "Kolaghan's Command"), c(4, "Blood Crypt"), c(4, "Blackcleave Cliffs"), c(3, "Blightstep Pathway"), c(3, "Swamp"), c(2, "Mountain"), c(2, "Fable of the Mirror-Breaker"), c(2, "Bloodtithe Harvester"), c(2, "Kroxa, Titan of Death's Hunger"), c(2, "Claim // Fame"), c(2, "Unholy Heat"), c(2, "Takenuma, Abandoned Mire"), c(2, "Den of the Bugbear"), c(2, "Hive of the Eye Tyrant")] },
  ],
  pioneer: [
    { name: "Rakdos Midrange", colors: ["B", "R"], tier: 1, metaShare: 13, description: "Pioneer workhorse with Fable and Thoughtseize.", mainboard: [c(4, "Bloodtithe Harvester"), c(4, "Bonecrusher Giant"), c(3, "Fable of the Mirror-Breaker"), c(3, "Sheoldred, the Apocalypse"), c(4, "Thoughtseize"), c(4, "Fatal Push"), c(3, "Dreadbore"), c(4, "Blood Crypt"), c(4, "Blackcleave Cliffs"), c(3, "Haunted Ridge"), c(4, "Swamp"), c(3, "Mountain"), c(2, "Castle Locthwain"), c(2, "Takenuma, Abandoned Mire"), c(2, "Graveyard Trespasser"), c(2, "Duress"), c(2, "Extinction Event"), c(2, "Den of the Bugbear"), c(2, "Blightstep Pathway")] },
    { name: "Azorius Control", colors: ["W", "U"], tier: 1, metaShare: 12, description: "Verdicts and Teferi for Pioneer Bo3.", mainboard: [c(4, "Memory Deluge"), c(3, "Supreme Verdict"), c(2, "Farewell"), c(4, "No More Lies"), c(3, "Dovin's Veto"), c(3, "Teferi, Hero of Dominaria"), c(4, "Hallowed Fountain"), c(4, "Hengegate Pathway"), c(3, "Deserted Beach"), c(4, "Island"), c(3, "Plains"), c(2, "Shark Typhoon"), c(2, "Get Lost"), c(2, "Otawara, Soaring City"), c(2, "Eiganjo, Seat of the Empire"), c(2, "Hall of Storm Giants"), c(2, "Field of Ruin"), c(2, "Strict Proctor"), c(2, "Change the Equation"), c(1, "Absorb")], sideboard: [c(2, "Rest in Peace"), c(2, "Dovin's Veto"), c(2, "Mystical Dispute"), c(2, "Narset, Parter of Veils"), c(2, "Aether Gust"), c(1, "Farewell"), c(2, "Elspeth Conquers Death"), c(2, "Summary Dismissal")] },
    { name: "Izzet Phoenix", colors: ["U", "R"], tier: 2, metaShare: 10, description: "Arclight Phoenix recursion storm.", mainboard: [c(4, "Arclight Phoenix"), c(4, "Consider"), c(4, "Opt"), c(4, "Lightning Axe"), c(3, "Fiery Impulse"), c(3, "Treasure Cruise"), c(4, "Spirebluff Canal"), c(4, "Steam Vents"), c(4, "Island"), c(3, "Mountain"), c(3, "Expressive Iteration"), c(2, "Piecie of Mind"), c(2, "Ledger Shredder"), c(2, "Stormcarved Coast"), c(2, "Otawara, Soaring City"), c(2, "Thing in the Ice"), c(2, "Picklock Prankster"), c(2, "Fiery Islet"), c(2, "Temporal Trespass")] },
    { name: "Lotus Field", colors: ["U", "G"], tier: 2, metaShare: 9, description: "Combo lotus into massive turns.", mainboard: [c(4, "Lotus Field"), c(4, "Hidden Strings"), c(4, "Pore Over the Pages"), c(3, "Sylvan Scrying"), c(3, "Strict Proctor"), c(4, "Botanical Sanctum"), c(4, "Breeding Pool"), c(4, "Island"), c(3, "Forest"), c(3, "Thespian's Stage"), c(2, "Otawara, Soaring City"), c(2, "Boseiju, Who Endures"), c(2, "Vizier of Tumbling Sands"), c(2, "Tangled Florahedron"), c(2, "Dig Through Time"), c(2, "Dark Petition"), c(2, "Wish"), c(2, "Emergent Ultimatum"), c(2, "Omniscience")] },
    { name: "Amalia Combo", colors: ["W", "B"], tier: 2, metaShare: 8, description: "Amalia + Wildgrowth Walker life combo.", mainboard: [c(4, "Amalia Benavides Aguirre"), c(4, "Wildgrowth Walker"), c(4, "Cenote Scout"), c(3, "Selfless Savior"), c(3, "Collected Company"), c(4, "Godless Shrine"), c(4, "Concealed Courtyard"), c(3, "Razorverge Thicket"), c(3, "Blooming Marsh"), c(2, "Plains"), c(2, "Swamp"), c(2, "Forest"), c(2, "Boseiju, Who Endures"), c(2, "Eiganjo, Seat of the Empire"), c(2, "Return to the Ranks"), c(2, "Chord of Calling"), c(2, "Extraction Specialist"), c(2, "Skyclave Apparition"), c(2, "Deep-Cavern Bat"), c(2, "Lunarch Veteran")] },
    { name: "Mono-Green Devotion", colors: ["G"], tier: 3, metaShare: 7, description: "Cavalier and Nykthos big mana.", mainboard: [c(4, "Elvish Mystic"), c(4, "Llanowar Elves"), c(4, "Old-Growth Troll"), c(3, "Cavalier of Thorns"), c(3, "Karn, the Great Creator"), c(4, "Nykthos, Shrine to Nyx"), c(8, "Forest"), c(3, "Lair of the Hydra"), c(2, "Boseiju, Who Endures"), c(2, "Storm the Festival"), c(2, "Kiora, Behemoth Beckoner"), c(2, "Polukranos Reborn"), c(2, "Cityscape Leveler"), c(2, "Vorinclex, Monstrous Raider"), c(2, "The World Tree"), c(2, "Garruk's Uprising"), c(2, "Trail of Crumbs"), c(2, "Wolfwillow Haven"), c(2, "Portable Hole")] },
    { name: "Boros Heroic", colors: ["W", "R"], tier: 3, metaShare: 6, description: "Heroic pump and protection.", mainboard: [c(4, "Favored Hoplite"), c(4, "Monastery Swiftspear"), c(4, "Reckless Rage"), c(4, "Gods Willing"), c(3, "Defiant Strike"), c(4, "Sacred Foundry"), c(4, "Inspiring Vantage"), c(4, "Mountain"), c(3, "Plains"), c(3, "Den of the Bugbear"), c(2, "Eiganjo, Seat of the Empire"), c(2, "Sokenzan, Crucible of Defiance"), c(2, "Tenth District Legionnaire"), c(2, "Ancestral Anger"), c(2, "Homestead Courage"), c(2, "Sheltered by Ghosts"), c(2, "Showdown of the Skalds"), c(2, "Monastery Mentor"), c(2, "Play with Fire")] },
    { name: "Dimir Control", colors: ["U", "B"], tier: 3, metaShare: 5, description: "Discard and permission for Pioneer.", mainboard: [c(4, "Thoughtseize"), c(4, "Fatal Push"), c(3, "Sheoldred, the Apocalypse"), c(3, "Memory Deluge"), c(3, "Drown in the Loch"), c(4, "Watery Grave"), c(4, "Darkslick Shores"), c(3, "Clearwater Pathway"), c(3, "Island"), c(3, "Swamp"), c(2, "Otawara, Soaring City"), c(2, "Takenuma, Abandoned Mire"), c(2, "Narset, Parter of Veils"), c(2, "Shark Typhoon"), c(2, "Extinction Event"), c(2, "Negate"), c(2, "Censor"), c(2, "Consider"), c(2, "Field of Ruin"), c(2, "Hall of Storm Giants")] },
  ],
  timeless: [
    { name: "Reanimator", colors: ["U", "B"], tier: 1, metaShare: 9, description: "Entomb into Archon / Atraxa.", mainboard: [c(4, "Dark Ritual"), c(4, "Entomb"), c(4, "Reanimate"), c(3, "Animate Dead"), c(3, "Thoughtseize"), c(3, "Brainstorm"), c(2, "Show and Tell"), c(2, "Atraxa, Grand Unifier"), c(2, "Archon of Cruelty"), c(4, "Polluted Delta"), c(4, "Flooded Strand"), c(3, "Underground Sea"), c(2, "Watery Grave"), c(2, "Island"), c(3, "Swamp"), c(2, "Demonic Tutor"), c(2, "Fatal Push"), c(2, "Daze"), c(1, "Griselbrand"), c(2, "Ponder"), c(2, "Otawara, Soaring City")] },
    { name: "Death's Shadow", colors: ["W", "U", "B"], tier: 1, metaShare: 8, description: "Interactive midrange with a lethal clock.", mainboard: [c(4, "Death's Shadow"), c(4, "Ragavan, Nimble Pilferer"), c(3, "Dragon's Rage Channeler"), c(4, "Thoughtseize"), c(4, "Fatal Push"), c(3, "Stubborn Denial"), c(4, "Polluted Delta"), c(4, "Bloodstained Mire"), c(2, "Watery Grave"), c(2, "Steam Vents"), c(2, "Hallowed Fountain"), c(2, "Swamp"), c(1, "Island"), c(1, "Mountain"), c(1, "Plains"), c(2, "Street Wraith"), c(2, "Dismember"), c(2, "Kolaghan's Command"), c(2, "Preordain"), c(2, "Marsh Flats"), c(2, "Otawara, Soaring City"), c(1, "Godless Shrine"), c(1, "Blood Crypt")], sideboard: [c(2, "Consign to Memory"), c(2, "Surgical Extraction"), c(2, "Unlicensed Hearse"), c(2, "Dress Down"), c(2, "Wear // Tear"), c(1, "Engineered Explosives"), c(2, "Mystical Dispute"), c(2, "Celestial Purge")] },
    { name: "Show and Tell", colors: ["U"], tier: 2, metaShare: 7, description: "Omniscience / Emrakul packages.", mainboard: [c(4, "Show and Tell"), c(4, "Brainstorm"), c(4, "Ponder"), c(3, "Force of Will"), c(2, "Omniscience"), c(2, "Emrakul, the Aeons Torn"), c(4, "Flooded Strand"), c(4, "Misty Rainforest"), c(4, "Island"), c(3, "Tropical Island"), c(2, "Otawara, Soaring City"), c(2, "Force of Negation"), c(2, "Daze"), c(2, "Veil of Summer"), c(2, "Dress Down"), c(2, "Swords to Plowshares"), c(2, "Atraxa, Grand Unifier"), c(2, "Flusterstorm"), c(2, "Spell Pierce"), c(2, "Lotus Petal")] },
    { name: "Beanstalk Control", colors: ["W", "U", "G"], tier: 2, metaShare: 7, description: "Up the Beanstalk card advantage control.", mainboard: [c(4, "Up the Beanstalk"), c(3, "Teferi, Time Raveler"), c(3, "Supreme Verdict"), c(3, "Swords to Plowshares"), c(3, "Force of Will"), c(4, "Flooded Strand"), c(4, "Misty Rainforest"), c(3, "Hallowed Fountain"), c(3, "Breeding Pool"), c(2, "Temple Garden"), c(2, "Island"), c(2, "Plains"), c(2, "Forest"), c(2, "Solitude"), c(2, "Subtlety"), c(2, "Omnath, Locus of Creation"), c(2, "The One Ring"), c(2, "Leyline Binding"), c(2, "Prismatic Ending"), c(2, "Otawara, Soaring City"), c(2, "Boseiju, Who Endures")] },
    { name: "Initiative", colors: ["W"], tier: 2, metaShare: 6, description: "White Weenie with The Initiative.", mainboard: [c(4, "White Plume Adventurer"), c(4, "Seasoned Dungeoneer"), c(4, "Thalia, Guardian of Thraben"), c(3, "Solitude"), c(4, "Swords to Plowshares"), c(4, "Flooded Strand"), c(4, "Marsh Flats"), c(6, "Plains"), c(2, "Eiganjo, Seat of the Empire"), c(2, "Karakas"), c(2, "Mother of Runes"), c(2, "Stoneforge Mystic"), c(2, "Batterskull"), c(2, "Sword of Fire and Ice"), c(2, "Cathar Commando"), c(2, "Lion Sash"), c(2, "Prismatic Ending"), c(2, "Unexpectedly Absent"), c(2, "Anointed Peacekeeper")] },
    { name: "Storm", colors: ["U", "B", "R"], tier: 3, metaShare: 5.5, description: "Classic storm with dark ritual density.", mainboard: [c(4, "Dark Ritual"), c(4, "Brainstorm"), c(4, "Ponder"), c(3, "Tendrils of Agony"), c(3, "Burning Wish"), c(4, "Polluted Delta"), c(4, "Bloodstained Mire"), c(3, "Underground Sea"), c(2, "Volcanic Island"), c(2, "Swamp"), c(2, "Island"), c(2, "Lion's Eye Diamond"), c(2, "Lotus Petal"), c(2, "Chrome Mox"), c(2, "Mishra's Bauble"), c(2, "Thoughtseize"), c(2, "Duress"), c(2, "Cabal Ritual"), c(2, "Past in Flames"), c(2, "Infernal Tutor")] },
    { name: "Dimir Midrange", colors: ["U", "B"], tier: 3, metaShare: 5, description: "Fair blue-black value for Timeless.", mainboard: [c(4, "Orcish Bowmasters"), c(4, "Ragavan, Nimble Pilferer"), c(4, "Thoughtseize"), c(4, "Fatal Push"), c(3, "Force of Will"), c(4, "Polluted Delta"), c(4, "Flooded Strand"), c(3, "Underground Sea"), c(2, "Watery Grave"), c(2, "Island"), c(2, "Swamp"), c(2, "Sheoldred, the Apocalypse"), c(2, "Murderous Cut"), c(2, "Daze"), c(2, "Brainstorm"), c(2, "Ponder"), c(2, "Otawara, Soaring City"), c(2, "Takenuma, Abandoned Mire"), c(2, "Brazen Borrower"), c(2, "Psychic Frog")] },
    { name: "Domain Zoo", colors: ["W", "U", "B", "R", "G"], tier: 3, metaShare: 4.5, description: "Tribal Flames style domain aggro.", mainboard: [c(4, "Ragavan, Nimble Pilferer"), c(4, "Wild Nacatl"), c(4, "Tribal Flames"), c(3, "Lightning Bolt"), c(3, "Swords to Plowshares"), c(4, "Wooded Foothills"), c(4, "Windswept Heath"), c(3, "Flooded Strand"), c(2, "Temple Garden"), c(2, "Sacred Foundry"), c(2, "Breeding Pool"), c(2, "Steam Vents"), c(2, "Overgrown Tomb"), c(1, "Forest"), c(1, "Plains"), c(1, "Mountain"), c(1, "Island"), c(1, "Swamp"), c(2, "Scavenging Ooze"), c(2, "Tarmogoyf"), c(2, "Stubborn Denial"), c(2, "Prismatic Ending"), c(2, "Leyline Binding")] },
  ],
  brawl: [
    { name: "Atraxa Midrange", colors: ["W", "U", "B", "G"], tier: 1, metaShare: 7, description: "Value pile with Atraxa as commander.", commander: "Atraxa, Grand Unifier", mainboard: [c(1, "Swords to Plowshares"), c(1, "Fatal Push"), c(1, "Counterspell"), c(1, "Growth Spiral"), c(1, "Cultivate"), c(1, "Teferi, Time Raveler"), c(1, "Sheoldred, the Apocalypse"), c(1, "Rhystic Study"), c(1, "Smothering Tithe"), c(1, "Cyclonic Rift"), c(1, "Demonic Tutor"), c(1, "Command Tower"), c(1, "Breeding Pool"), c(1, "Hallowed Fountain"), c(1, "Watery Grave"), c(1, "Overgrown Tomb"), c(1, "Temple Garden"), c(8, "Forest"), c(7, "Island"), c(6, "Plains"), c(6, "Swamp"), c(1, "Sol Ring"), c(1, "Arcane Signet"), c(1, "The One Ring"), c(1, "Assassin's Trophy"), c(1, "Toxic Deluge"), c(1, "Uro, Titan of Nature's Wrath"), c(1, "Boseiju, Who Endures"), c(1, "Otawara, Soaring City")] },
    { name: "Kinnan Combo", colors: ["U", "G"], tier: 1, metaShare: 6, description: "Explosive mana and combo lines.", commander: "Kinnan, Bonder Prodigy", mainboard: [c(1, "Sol Ring"), c(1, "Arcane Signet"), c(1, "Basalt Monolith"), c(1, "Mana Drain"), c(1, "Counterspell"), c(1, "Cyclonic Rift"), c(1, "Rhystic Study"), c(1, "Hullbreaker Horror"), c(1, "Breeding Pool"), c(1, "Command Tower"), c(12, "Island"), c(12, "Forest"), c(1, "Fierce Guardianship"), c(1, "Swan Song"), c(1, "The One Ring"), c(1, "Uro, Titan of Nature's Wrath"), c(1, "Gilded Goose"), c(1, "Llanowar Elves"), c(1, "Three Visits"), c(1, "Nature's Lore"), c(1, "Cultivate"), c(1, "Boseiju, Who Endures"), c(1, "Otawara, Soaring City"), c(1, "Seedborn Muse")] },
    { name: "Rusko Midrange", colors: ["U", "B"], tier: 2, metaShare: 5.5, description: "Clock and card advantage with Rusko.", commander: "Rusko, Clockmaker", mainboard: [c(1, "Counterspell"), c(1, "Fatal Push"), c(1, "Thoughtseize"), c(1, "Demonic Tutor"), c(1, "Rhystic Study"), c(1, "Sheoldred, the Apocalypse"), c(1, "Command Tower"), c(1, "Watery Grave"), c(10, "Island"), c(10, "Swamp"), c(1, "Sol Ring"), c(1, "Arcane Signet"), c(1, "The One Ring"), c(1, "Cyclonic Rift"), c(1, "Toxic Deluge"), c(1, "Otawara, Soaring City"), c(1, "Takenuma, Abandoned Mire"), c(1, "Snapcaster Mage"), c(1, "Brazen Borrower"), c(1, "Orcish Bowmasters")] },
    { name: "Tivit Control", colors: ["W", "U", "B"], tier: 2, metaShare: 5, description: "Clue value and control with Tivit.", commander: "Tivit, Seller of Secrets", mainboard: [c(1, "Swords to Plowshares"), c(1, "Counterspell"), c(1, "Demonic Tutor"), c(1, "Rhystic Study"), c(1, "Smothering Tithe"), c(1, "Command Tower"), c(1, "Hallowed Fountain"), c(1, "Watery Grave"), c(1, "Godless Shrine"), c(8, "Island"), c(6, "Plains"), c(6, "Swamp"), c(1, "Sol Ring"), c(1, "The One Ring"), c(1, "Cyclonic Rift"), c(1, "Teferi, Time Raveler"), c(1, "Supreme Verdict"), c(1, "Otawara, Soaring City"), c(1, "Eiganjo, Seat of the Empire")] },
    { name: "Etali Ramp", colors: ["R", "G"], tier: 2, metaShare: 4.5, description: "Big mana into Etali free casts.", commander: "Etali, Primal Conqueror", mainboard: [c(1, "Sol Ring"), c(1, "Cultivate"), c(1, "Farseek"), c(1, "Lightning Bolt"), c(1, "Command Tower"), c(1, "Stomping Ground"), c(10, "Forest"), c(10, "Mountain"), c(1, "Uro, Titan of Nature's Wrath"), c(1, "The One Ring"), c(1, "Boseiju, Who Endures"), c(1, "Sokenzan, Crucible of Defiance"), c(1, "Escape to the Wilds"), c(1, "Klothys, God of Destiny"), c(1, "Questing Beast"), c(1, "Arcane Signet"), c(1, "Three Visits"), c(1, "Nature's Lore")] },
    { name: "Agatha Tokens", colors: ["B", "R", "G"], tier: 3, metaShare: 4, description: "Food and tokens with Agatha.", commander: "Agatha of the Vile Cauldron", mainboard: [c(1, "Sol Ring"), c(1, "Fatal Push"), c(1, "Lightning Bolt"), c(1, "Command Tower"), c(1, "Overgrown Tomb"), c(1, "Blood Crypt"), c(1, "Stomping Ground"), c(8, "Forest"), c(6, "Swamp"), c(6, "Mountain"), c(1, "Gilded Goose"), c(1, "Trail of Crumbs"), c(1, "Cauldron Familiar"), c(1, "Witch's Oven"), c(1, "The One Ring"), c(1, "Assassin's Trophy"), c(1, "Boseiju, Who Endures")] },
    { name: "Najeela Warriors", colors: ["W", "U", "B", "R", "G"], tier: 3, metaShare: 3.8, description: "Combat-centric five-color warriors.", commander: "Najeela, the Blade-Blossom", mainboard: [c(1, "Sol Ring"), c(1, "Swords to Plowshares"), c(1, "Lightning Bolt"), c(1, "Command Tower"), c(1, "Mana Confluence"), c(4, "Plains"), c(4, "Island"), c(4, "Swamp"), c(4, "Mountain"), c(4, "Forest"), c(1, "Ragavan, Nimble Pilferer"), c(1, "Adeline, Resplendent Cathar"), c(1, "The One Ring"), c(1, "Cyclonic Rift"), c(1, "Teferi, Time Raveler"), c(1, "Breeding Pool"), c(1, "Sacred Foundry")] },
    { name: "Jodah Cascade", colors: ["W", "U", "B", "R", "G"], tier: 3, metaShare: 3.5, description: "Cascade and free spells with Jodah.", commander: "Jodah, the Unifier", mainboard: [c(1, "Sol Ring"), c(1, "Cultivate"), c(1, "Command Tower"), c(1, "Mana Confluence"), c(5, "Plains"), c(5, "Island"), c(5, "Swamp"), c(5, "Mountain"), c(5, "Forest"), c(1, "The One Ring"), c(1, "Rhystic Study"), c(1, "Smothering Tithe"), c(1, "Cyclonic Rift"), c(1, "Demonic Tutor"), c(1, "Swords to Plowshares"), c(1, "Lightning Bolt")] },
  ],
  standard_brawl: [
    { name: "Kellan Aggro", colors: ["W", "U"], tier: 1, metaShare: 8, description: "Proactive Standard Brawl with Kellan.", commander: "Kellan, the Kid", mainboard: [c(1, "Spyglass Siren"), c(1, "Deep-Cavern Bat"), c(1, "Get Lost"), c(1, "No More Lies"), c(1, "Three Steps Ahead"), c(1, "Wedding Announcement"), c(1, "The Wandering Emperor"), c(1, "Adarkar Wastes"), c(1, "Seachrome Coast"), c(1, "Restless Anchorage"), c(10, "Plains"), c(10, "Island"), c(1, "Eiganjo, Seat of the Empire"), c(1, "Otawara, Soaring City"), c(1, "Tishana's Tidebinder"), c(1, "Beza, the Bounding Spring"), c(1, "Temporary Lockdown"), c(1, "Steel Seraph"), c(1, "Floodfarm Verge")] },
    { name: "Jace Control", colors: ["U", "B"], tier: 1, metaShare: 7, description: "Control and mill with Jace.", commander: "Jace, the Perfected Mind", mainboard: [c(1, "Cut Down"), c(1, "Go for the Throat"), c(1, "Negate"), c(1, "Three Steps Ahead"), c(1, "Stock Up"), c(1, "Sheoldred, the Apocalypse"), c(1, "Deadly Cover-Up"), c(1, "Darkslick Shores"), c(1, "Underground River"), c(1, "Restless Reef"), c(12, "Island"), c(11, "Swamp"), c(1, "Otawara, Soaring City"), c(1, "Takenuma, Abandoned Mire"), c(1, "Tishana's Tidebinder"), c(1, "Duress"), c(1, "Gix's Command"), c(1, "Preacher of the Schism")], sideboard: [c(1, "Negate"), c(1, "Disdainful Stroke"), c(1, "Ghost Vacuum"), c(1, "Duress"), c(1, "Get Lost"), c(1, "Anoint with Affliction"), c(1, "The End"), c(1, "Tishana's Tidebinder")] },
    { name: "Kaito Ninja", colors: ["U", "B"], tier: 2, metaShare: 6, description: "Ninjutsu tempo with Kaito.", commander: "Kaito, Bane of Nightmares", mainboard: [c(1, "Spyglass Siren"), c(1, "Deep-Cavern Bat"), c(1, "Go for the Throat"), c(1, "Cut Down"), c(1, "Negate"), c(1, "Darkslick Shores"), c(1, "Underground River"), c(10, "Island"), c(10, "Swamp"), c(1, "Restless Reef"), c(1, "Tishana's Tidebinder"), c(1, "This Town Ain't Big Enough"), c(1, "Hopeless Nightmare"), c(1, "Otawara, Soaring City"), c(1, "Gloomlake Verge"), c(1, "Three Steps Ahead")] },
    { name: "Beza Midrange", colors: ["W"], tier: 2, metaShare: 5.5, description: "White midrange with Beza.", commander: "Beza, the Bounding Spring", mainboard: [c(1, "Get Lost"), c(1, "Temporary Lockdown"), c(1, "Wedding Announcement"), c(1, "The Wandering Emperor"), c(18, "Plains"), c(1, "Eiganjo, Seat of the Empire"), c(1, "Fountainport"), c(1, "Sheltered by Ghosts"), c(1, "Resolute Reinforcements"), c(1, "Warden of the Inner Sky"), c(1, "Steel Seraph"), c(1, "Caretaker's Talent"), c(1, "Case of the Uneaten Feast"), c(1, "Destroy Evil")] },
    { name: "Mono-Red Aggro", colors: ["R"], tier: 2, metaShare: 5, description: "Burn and haste for Standard Brawl.", commander: "Screaming Nemesis", mainboard: [c(1, "Monastery Swiftspear"), c(1, "Heartfire Hero"), c(1, "Slickshot Show-Off"), c(1, "Play with Fire"), c(1, "Lightning Strike"), c(18, "Mountain"), c(1, "Rockface Village"), c(1, "Den of the Bugbear"), c(1, "Emberheart Challenger"), c(1, "Witchstalker Frenzy"), c(1, "Burst Lightning"), c(1, "Sokenzan, Crucible of Defiance")] },
    { name: "Golgari Midrange", colors: ["B", "G"], tier: 3, metaShare: 4.5, description: "Value black-green for Standard Brawl.", commander: "Glissa Sunslayer", mainboard: [c(1, "Llanowar Elves"), c(1, "Deep-Cavern Bat"), c(1, "Go for the Throat"), c(1, "Cut Down"), c(1, "Blooming Marsh"), c(1, "Llanowar Wastes"), c(9, "Forest"), c(9, "Swamp"), c(1, "Restless Cottage"), c(1, "Sheoldred, the Apocalypse"), c(1, "Preacher of the Schism"), c(1, "Gix's Command"), c(1, "Boseiju, Who Endures"), c(1, "Duress")] },
    { name: "Izzet Spells", colors: ["U", "R"], tier: 3, metaShare: 4, description: "Spells matter with an Izzet legend.", commander: "Ral, Crackling Wit", mainboard: [c(1, "Consider"), c(1, "Opt"), c(1, "Play with Fire"), c(1, "Lightning Strike"), c(1, "Three Steps Ahead"), c(1, "Spirebluff Canal"), c(1, "Shivan Reef"), c(10, "Island"), c(9, "Mountain"), c(1, "Restless Spire"), c(1, "Slickshot Show-Off"), c(1, "Stock Up"), c(1, "Torch the Tower"), c(1, "Otawara, Soaring City")] },
    { name: "Domain Ramp", colors: ["W", "U", "B", "R", "G"], tier: 3, metaShare: 3.5, description: "Domain payoffs in Standard Brawl.", commander: "Herigast, Erupting Nullkite", mainboard: [c(1, "Leyline Binding"), c(1, "Up the Beanstalk"), c(1, "Get Lost"), c(1, "Commercial District"), c(1, "Hedge Maze"), c(1, "Lush Portico"), c(1, "Meticulous Archive"), c(4, "Forest"), c(3, "Island"), c(3, "Plains"), c(3, "Swamp"), c(3, "Mountain"), c(1, "Stock Up"), c(1, "Three Steps Ahead"), c(1, "Atraxa, Grand Unifier"), c(1, "Temporary Lockdown")] },
  ],
  historic_brawl: [
    { name: "Omnath Lands", colors: ["W", "U", "R", "G"], tier: 1, metaShare: 7, description: "Landfall value engine.", commander: "Omnath, Locus of Creation", mainboard: [c(1, "Sol Ring"), c(1, "Cultivate"), c(1, "Farseek"), c(1, "Growth Spiral"), c(1, "Uro, Titan of Nature's Wrath"), c(1, "Teferi, Time Raveler"), c(1, "Cyclonic Rift"), c(1, "Command Tower"), c(1, "Breeding Pool"), c(1, "Steam Vents"), c(1, "Stomping Ground"), c(1, "Temple Garden"), c(1, "Hallowed Fountain"), c(6, "Forest"), c(5, "Island"), c(4, "Mountain"), c(4, "Plains"), c(1, "The One Ring"), c(1, "Rhystic Study"), c(1, "Field of the Dead"), c(1, "Oracle of Mul Daya"), c(1, "Azusa, Lost but Seeking"), c(1, "Boseiju, Who Endures"), c(1, "Otawara, Soaring City")] },
    { name: "Tamiyo Control", colors: ["W", "U"], tier: 1, metaShare: 6, description: "Flash control with Tamiyo.", commander: "Tamiyo, Inquisitive Student", mainboard: [c(1, "Swords to Plowshares"), c(1, "Counterspell"), c(1, "Mana Drain"), c(1, "Dovin's Veto"), c(1, "Teferi, Time Raveler"), c(1, "Supreme Verdict"), c(1, "Cyclonic Rift"), c(1, "The One Ring"), c(1, "Hallowed Fountain"), c(1, "Command Tower"), c(12, "Island"), c(10, "Plains"), c(1, "Otawara, Soaring City"), c(1, "Eiganjo, Seat of the Empire"), c(1, "Memory Deluge"), c(1, "Shark Typhoon"), c(1, "The Wandering Emperor"), c(1, "Farewell")], sideboard: [c(1, "Rest in Peace"), c(1, "Dovin's Veto"), c(1, "Mystical Dispute"), c(1, "Aether Gust"), c(1, "Summary Dismissal"), c(1, "Elspeth Conquers Death"), c(1, "Pithing Needle"), c(1, "Grafdigger's Cage")] },
    { name: "Atraxa Value", colors: ["W", "U", "B", "G"], tier: 2, metaShare: 5.5, description: "Historic Brawl Atraxa midrange.", commander: "Atraxa, Grand Unifier", mainboard: [c(1, "Swords to Plowshares"), c(1, "Fatal Push"), c(1, "Counterspell"), c(1, "Demonic Tutor"), c(1, "Rhystic Study"), c(1, "Smothering Tithe"), c(1, "Command Tower"), c(1, "Breeding Pool"), c(1, "Hallowed Fountain"), c(1, "Watery Grave"), c(1, "Overgrown Tomb"), c(6, "Forest"), c(6, "Island"), c(5, "Plains"), c(5, "Swamp"), c(1, "Sol Ring"), c(1, "The One Ring"), c(1, "Cyclonic Rift"), c(1, "Sheoldred, the Apocalypse"), c(1, "Uro, Titan of Nature's Wrath")] },
    { name: "Rusko Clocks", colors: ["U", "B"], tier: 2, metaShare: 5, description: "Clockmaker value in Historic Brawl.", commander: "Rusko, Clockmaker", mainboard: [c(1, "Counterspell"), c(1, "Fatal Push"), c(1, "Thoughtseize"), c(1, "Demonic Tutor"), c(1, "Rhystic Study"), c(1, "Command Tower"), c(1, "Watery Grave"), c(10, "Island"), c(10, "Swamp"), c(1, "Sol Ring"), c(1, "The One Ring"), c(1, "Cyclonic Rift"), c(1, "Sheoldred, the Apocalypse"), c(1, "Orcish Bowmasters"), c(1, "Otawara, Soaring City")] },
    { name: "Kinnan", colors: ["U", "G"], tier: 2, metaShare: 4.8, description: "Combo mana with Kinnan.", commander: "Kinnan, Bonder Prodigy", mainboard: [c(1, "Sol Ring"), c(1, "Basalt Monolith"), c(1, "Mana Drain"), c(1, "Counterspell"), c(1, "Rhystic Study"), c(1, "Breeding Pool"), c(1, "Command Tower"), c(12, "Island"), c(12, "Forest"), c(1, "The One Ring"), c(1, "Hullbreaker Horror"), c(1, "Fierce Guardianship"), c(1, "Uro, Titan of Nature's Wrath"), c(1, "Llanowar Elves"), c(1, "Boseiju, Who Endures")] },
    { name: "Etali Ramp", colors: ["R", "G"], tier: 3, metaShare: 4, description: "Ramp into free-cast Etali.", commander: "Etali, Primal Conqueror", mainboard: [c(1, "Sol Ring"), c(1, "Cultivate"), c(1, "Farseek"), c(1, "Command Tower"), c(1, "Stomping Ground"), c(10, "Forest"), c(10, "Mountain"), c(1, "The One Ring"), c(1, "Uro, Titan of Nature's Wrath"), c(1, "Escape to the Wilds"), c(1, "Boseiju, Who Endures"), c(1, "Lightning Bolt"), c(1, "Three Visits"), c(1, "Nature's Lore")] },
    { name: "Golos Field", colors: ["W", "U", "B", "R", "G"], tier: 3, metaShare: 3.8, description: "Five-color Golos / Field strategies.", commander: "Golos, Tireless Pilgrim", mainboard: [c(1, "Sol Ring"), c(1, "Cultivate"), c(1, "Field of the Dead"), c(1, "Command Tower"), c(1, "Mana Confluence"), c(4, "Plains"), c(4, "Island"), c(4, "Swamp"), c(4, "Mountain"), c(4, "Forest"), c(1, "The One Ring"), c(1, "Cyclonic Rift"), c(1, "Demonic Tutor"), c(1, "Swords to Plowshares"), c(1, "Growth Spiral"), c(1, "Fabled Passage")] },
    { name: "Yorion Blink", colors: ["W", "U"], tier: 3, metaShare: 3.5, description: "Blink value with Yorion companion energy.", commander: "Yorion, Sky Nomad", mainboard: [c(1, "Swords to Plowshares"), c(1, "Counterspell"), c(1, "Teferi, Time Raveler"), c(1, "Skyclave Apparition"), c(1, "Hallowed Fountain"), c(1, "Command Tower"), c(10, "Island"), c(10, "Plains"), c(1, "Sol Ring"), c(1, "The One Ring"), c(1, "Supreme Verdict"), c(1, "Elite Spellbinder"), c(1, "Omen of the Sea"), c(1, "Otawara, Soaring City"), c(1, "Eiganjo, Seat of the Empire")] },
  ],
};

const FORMAT_META: {
  id: FormatId;
  name: string;
  shortLabel: string;
  featured?: boolean;
  metaNotes: string;
}[] = [
  { id: "standard", name: "Standard", shortLabel: "STD", featured: true, metaNotes: "Eight daily Standard lists ranked by meta share and recent results. Bo1 leans tempo/aggro; Bo3 deepens midrange and control." },
  { id: "alchemy", name: "Alchemy", shortLabel: "ALC", metaNotes: "Alchemy shifts with balance patches — eight shells covering ladder and event play." },
  { id: "historic", name: "Historic", shortLabel: "HIS", metaNotes: "Historic rewards collection depth; eight decks from control to combo." },
  { id: "pioneer", name: "Pioneer", shortLabel: "PIO", metaNotes: "Arena Pioneer tracks paper/RCQ results — eight competitive shells." },
  { id: "timeless", name: "Timeless", shortLabel: "TIM", metaNotes: "High power. Eight lists spanning combo, fair midrange, and control." },
  { id: "brawl", name: "Brawl", shortLabel: "BRW", metaNotes: "Eight commander-led Brawl lists for the open queue." },
  { id: "standard_brawl", name: "Standard Brawl", shortLabel: "SBR", metaNotes: "Eight Standard-legal Brawl commanders and shells." },
  { id: "historic_brawl", name: "Historic Brawl", shortLabel: "HBR", metaNotes: "Eight high-power Historic Brawl commanders." },
];

function matchupsFor(name: string, peers: string[]): Deck["matchups"] {
  const others = peers.filter((p) => p !== name).slice(0, 3);
  const favors: Array<"favored" | "even" | "unfavored"> = ["favored", "even", "unfavored"];
  return others.map((vs, i) => ({
    vs,
    favor: favors[i % 3],
    notes:
      i === 0
        ? "Keep interaction for their key turns; you are favored if you curve out."
        : i === 1
          ? "Skill-intensive mirror of plans — pilot edge decides."
          : "Mulligan for hate pieces; they can run away if unanswered.",
  }));
}

function sideGuide(mode: PlayMode, name: string): Deck["sideboardGuide"] {
  if (mode !== "bo3") return [];
  return [
    {
      vs: "Aggro",
      in: ["2 early removal", "1 sweeper"],
      out: ["2 slow card draw", "1 expensive threat"],
      notes: `Against fast decks with ${name}: prioritize life and board.`,
    },
    {
      vs: "Control",
      in: ["2 permission", "1 threat density"],
      out: ["2 situational creature hate", "1 life-gain"],
      notes: "Post-board becomes a stack war — protect your haymakers.",
    },
  ];
}

function makeDeck(
  format: FormatId,
  mode: PlayMode,
  rank: number,
  arch: ArchetypeDef,
  peers: string[],
): Deck {
  const id = `${format}-${mode}-r${rank}-${arch.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const sideboard = mode === "bo3" ? (arch.sideboard ?? []) : [];
  // Bo1: slightly leaner sideboard empty; optional trim of slow cards is editorial only
  const mainboard = arch.mainboard;
  const arenaImport = buildArenaImport({
    mainboard,
    sideboard,
    commander: arch.commander,
  });
  return {
    id,
    name: arch.name,
    format,
    mode,
    rank,
    tier: arch.tier,
    colors: arch.colors,
    archetype: arch.name,
    description: `${arch.description} Daily rank #${rank} for ${mode.toUpperCase()}.`,
    mainboard,
    sideboard,
    matchups: matchupsFor(arch.name, peers),
    sideboardGuide: sideGuide(mode, arch.name),
    arenaImport,
    sources: [
      { name: "MTGGoldfish Metagame", url: "https://www.mtggoldfish.com/metagame" },
      { name: "Melee.gg", url: "https://melee.gg/" },
      { name: "Scryfall", url: "https://scryfall.com" },
    ],
    metaShare: arch.metaShare,
    commander: arch.commander,
  };
}

function buildSeed(): MetaBundle {
  const decks: Record<string, Deck> = {};
  const formats: FormatMeta[] = [];

  for (const fm of FORMAT_META) {
    const arches = ARCHETYPES[fm.id];
    if (arches.length !== 8) {
      throw new Error(`${fm.id} must define exactly 8 archetypes, got ${arches.length}`);
    }
    const peers = arches.map((a) => a.name);
    const bo1Ids: string[] = [];
    const bo3Ids: string[] = [];

    arches.forEach((arch, i) => {
      const rank = i + 1;
      const bo1 = makeDeck(fm.id, "bo1", rank, arch, peers);
      const bo3 = makeDeck(fm.id, "bo3", rank, arch, peers);
      // Bo3: slight meta share bump for midrange/control names
      if (/control|midrange|domain/i.test(arch.name)) {
        bo3.metaShare = Math.round((arch.metaShare + 0.8) * 10) / 10;
      }
      if (/aggro|prowess|phoenix|heroic/i.test(arch.name)) {
        bo1.metaShare = Math.round((arch.metaShare + 0.6) * 10) / 10;
      }
      decks[bo1.id] = bo1;
      decks[bo3.id] = bo3;
      bo1Ids.push(bo1.id);
      bo3Ids.push(bo3.id);
    });

    const t1 = arches.filter((a) => a.tier === 1).map((a) => a.name);
    const t2 = arches.filter((a) => a.tier === 2).map((a) => a.name);
    const t3 = arches.filter((a) => a.tier === 3).map((a) => a.name);

    formats.push({
      id: fm.id,
      name: fm.name,
      shortLabel: fm.shortLabel,
      featured: fm.featured,
      bo1DeckIds: bo1Ids,
      bo3DeckIds: bo3Ids,
      bo1: { deckId: bo1Ids[0] },
      bo3: { deckId: bo3Ids[0] },
      tiers: [
        { tier: 1, archetypes: t1 },
        { tier: 2, archetypes: t2 },
        { tier: 3, archetypes: t3 },
      ],
      metaNotes: fm.metaNotes,
      metaShareTop: arches.slice(0, 4).map((a) => ({ name: a.name, pct: a.metaShare })),
    });
  }

  const tournaments: TournamentResult[] = [
    {
      id: "t-melee-1",
      name: "Regional Championship — Standard",
      format: "standard",
      platform: "paper",
      date: "2026-07-08",
      url: "https://melee.gg/Tournament/Search",
      players: 320,
      topDecks: [
        { place: 1, archetype: "Dimir Midrange" },
        { place: 2, archetype: "Izzet Prowess" },
        { place: 3, archetype: "Domain Control" },
        { place: 4, archetype: "Boros Aggro" },
      ],
      notes: "Melee.gg paper RC — Dimir and Izzet dominated Top 8.",
      source: "melee",
    },
    {
      id: "t-mtgo-1",
      name: "Standard Challenge",
      format: "standard",
      platform: "mtgo",
      date: "2026-07-07",
      url: "https://www.mtggoldfish.com/tournament",
      players: 189,
      topDecks: [
        { place: 1, archetype: "Dimir Midrange" },
        { place: 2, archetype: "Domain Control" },
        { place: 3, archetype: "Izzet Prowess" },
      ],
      source: "mtggoldfish",
    },
    {
      id: "t-mtga-1",
      name: "Arena Direct — Traditional Standard",
      format: "standard",
      platform: "mtga",
      date: "2026-07-06",
      url: "https://magic.wizards.com/en/mtgarena",
      players: 512,
      topDecks: [
        { place: 1, archetype: "Dimir Midrange" },
        { place: 2, archetype: "Boros Aggro" },
        { place: 3, archetype: "Azorius Control" },
      ],
      source: "wizards",
    },
    {
      id: "t-melee-2",
      name: "Pioneer RCQ",
      format: "pioneer",
      platform: "paper",
      date: "2026-07-05",
      url: "https://melee.gg/Tournament/Search",
      players: 128,
      topDecks: [
        { place: 1, archetype: "Rakdos Midrange" },
        { place: 2, archetype: "Azorius Control" },
        { place: 3, archetype: "Izzet Phoenix" },
      ],
      source: "melee",
    },
    {
      id: "t-hist-1",
      name: "Historic Challenge",
      format: "historic",
      platform: "mtgo",
      date: "2026-07-04",
      url: "https://www.mtggoldfish.com/tournament",
      players: 142,
      topDecks: [
        { place: 1, archetype: "Jeskai Control" },
        { place: 2, archetype: "Jund Midrange" },
      ],
      source: "mtggoldfish",
    },
  ];

  const today = new Date().toISOString().slice(0, 10);
  return {
    generatedAt: new Date().toISOString(),
    date: today,
    formats,
    decks,
    tournaments,
    sources: ["seed", "scryfall", "mtggoldfish", "melee", "wizards"],
    version: "0.2.0",
    decksPerFormat: 8,
  };
}

export const seedMeta: MetaBundle = buildSeed();
