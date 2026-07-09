import type { CardEntry } from "../types/meta";

const BASIC_LAND =
  /^(Plains|Island|Swamp|Mountain|Forest|Wastes|Snow-Covered |Starting Town)/i;

/** Rough CMC heuristic from card name patterns — good enough for UI curve bars. */
export function estimateCmc(name: string): number {
  if (BASIC_LAND.test(name) || /lands?$/i.test(name) && /dual|shock|fetch|verge|pathway|triome|surf|canal|reef|cottage|spire|anchorage|bivouac|prairie|fortress|vents|ridgeline/i.test(name)) {
    // Duals and utility lands still cmc 0
  }
  if (
    /^(Plains|Island|Swamp|Mountain|Forest)/i.test(name) ||
    /Verge$|Pathway$|Canal$|Reef$|Shores$|Coast$|Fountain$|Vents$|Crypt$|Tomb$|Ground$|Garden$|Shrine|Triome|Strand|Delta|Mire|Heath|Foothills|Town$|Sewers$|Archive$|Falls$|Theater$|Backstreet$|District$|Maze$|Portico$|Citadel|Treasure Vault|Command Tower|Boseiju|Otawara|Eiganjo|Takenuma|Sokenzan|Karakas|Nykthos|Lair of the Hydra|Den of the Bugbear|Hive of the Eye|Castle |Hall of Storm|Field of |Fabled Passage|Mana Confluence|Breeding Pool|Hallowed Fountain|Watery Grave|Overgrown Tomb|Temple Garden|Godless Shrine|Blood Crypt|Steam Vents|Sacred Foundry|Stomping Ground|Flooded Strand|Polluted Delta|Misty Rainforest|Wooded Foothills|Windswept Heath|Bloodstained Mire|Marsh Flats|Blackcleave Cliffs|Blooming Marsh|Copperline Gorge|Darkslick Shores|Seachrome Coast|Inspiring Vantage|Razorverge Thicket|Brushland|Llanowar Wastes|Underground River|Shivan Reef|Adarkar Wastes|Battlefield Forge|Caves of Koilos|Concealed Courtyard|Sulfurous Springs|Yavimaya Coast|Hinterland Harbor|Restless |Starting Town|Commercial District|Hedge Maze|Lush Portico|Meticulous Archive|Shadowy Backstreet|Undercity Sewers|Thundering Falls|Raucous Theater|Floodfarm Verge|Gloomlake Verge|Hushwood Verge|Wastewood Verge|Rockface Village/i.test(
      name,
    )
  ) {
    return 0;
  }
  // Known high-CMC finishers
  if (/Atraxa|Emrakul|Worldspine|Cityscape Leveler|Vorinclex|Omniscience|Griselbrand|Archon of Cruelty/i.test(name))
    return 7;
  if (/Sheoldred|Overlord|Gearhulk|Emperor|Beza|Tidebinder|Preacher|Aclazotz|Gix's Command|Farewell|Teferi, Hero|Glorybringer|Hullbreaker|Seedborn|Smothering|Rhystic|Cyclonic|Demonic Tutor|The One Ring/i.test(name))
    return 4;
  if (/Slickshot|Swiftspear|Consider|Opt|Play with Fire|Cut Down|Duress|Fatal Push|Thoughtseize|Lightning |Torch|Burst|Llanowar|Elvish|Spyglass|Hopeless|This Town|Into the Flood|Sleight|Bushwhack|Snakeskin|Sol Ring|Dark Ritual|Entomb|Reanimate|Brainstorm|Ponder|Daze|Force of |Swords to Plowshares|Lightning Bolt/i.test(name))
    return 1;
  if (/Stock Up|Three Steps|Go for the Throat|Negate|Get Lost|Deep-Cavern|Monastery|Stormcatch|Bloodtithe|Ragavan|Deathrite|Bonecrusher|Fable of|Wrenn and|Expressive|Memory Deluge|No More Lies|Dovin's Veto|Lightning Helix|Wedding|Sheltered|Authority|Destroy Evil|Anoint|Disdainful|Ghost Vacuum|Portable Hole|Mishra's Bauble|Lotus Petal|Chrome Mox|Mox Amber|Springleaf|Memnite|Ornithopter|Gingerbrute/i.test(name))
    return 2;
  if (/Preacher|Tidebinder|Temporary Lockdown|Steel Seraph|Brightglass|Practiced Offense|Collector's Cage|Accumulate Wisdom|Tablet of Discovery|Jeskai Revelation|Flow State|Eddymurk|Namor|Deceit|Superior Spider|Requiting Hex|Icetill|Earthbender|Frenzied Baloth|Keen-Eyed|Scrapshooter|Pawpatch|Badgermole|Indomitable Creativity|Collected Company|Arclight|Treasure Cruise|Lightning Axe|Fiery Impulse|Strict Proctor|Teferi, Time|The Wandering|Brotherhood's End|Deadly Cover-Up|The End|Gix's Command|Inevitable Defeat/i.test(name))
    return 3;
  if (/Show and Tell|Animate Dead|Omnath|Uro, Titan|Esika's Chariot|Elder Gargaroth|Cavalier of|Storm the Festival|Wish|Emergent Ultimatum|Shark Typhoon|Supreme Verdict|Wrath of God|Extinction Event|Kolaghan's Command|Toxic Deluge|Assassin's Trophy|Cultivate|Farseek|Growth Spiral|Three Visits|Nature's Lore/i.test(name))
    return 5;
  return 3;
}

export function buildManaCurve(cards: CardEntry[]): { cmc: number; count: number }[] {
  const buckets = new Map<number, number>();
  for (let i = 0; i <= 7; i++) buckets.set(i, 0);
  for (const card of cards) {
    let cmc = estimateCmc(card.name);
    if (cmc > 7) cmc = 7;
    buckets.set(cmc, (buckets.get(cmc) ?? 0) + card.count);
  }
  return Array.from(buckets.entries()).map(([cmc, count]) => ({ cmc, count }));
}

export function colorDistribution(
  colors: string[],
): { color: string; weight: number }[] {
  if (!colors.length) return [{ color: "C", weight: 1 }];
  return colors.map((color) => ({ color, weight: 1 / colors.length }));
}
