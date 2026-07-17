/**
 * Name-based land detection for lists that carry no type information
 * (Arena-id decklists, older feeds). Heuristic by design: the pipeline embeds
 * a real `land` flag wherever it can — this is only the fallback. One shared
 * regex so new land cycles get added in exactly one place.
 */

const BASIC_LAND_RE = /^(Plains|Island|Swamp|Mountain|Forest|Snow-Covered|Wastes)/i;

const LAND_NAME_RE =
  /Verge$|Pathway$|Canal$|Reef$|Shores$|Coast$|Fountain$|Vents$|Crypt$|Tomb$|Town$|Sewers$|Archive$|Falls$|Theater$|Backstreet$|District$|Maze$|Portico$|Monastery$|Village$|^Restless |^Starting Town|Brushland|Razorverge|Llanowar Wastes|Underground River|Shivan Reef|Adarkar|Battlefield Forge|Caves of Koilos|Concealed Courtyard|Blooming Marsh|Blackcleave|Inspiring Vantage|Spirebluff|Seachrome|Darkslick|Hushwood|Wastewood|Floodfarm|Gloomlake|Commercial District|Hedge Maze|Lush Portico|Meticulous|Shadowy|Undercity|Thundering|Raucous|Boseiju|Otawara|Eiganjo|Takenuma|Sokenzan|Lair of the Hydra|Rockface|Den of the Bugbear|Command Tower|Breeding Pool|Hallowed Fountain|Watery Grave|Overgrown Tomb|Temple Garden|Godless Shrine|Blood Crypt|Steam Vents|Sacred Foundry|Stomping Ground|Flooded Strand|Polluted Delta|Misty Rainforest|Windswept Heath|Wooded Foothills|Bloodstained Mire|Marsh Flats|Scalding Tarn|Arid Mesa|Verdant Catacombs|Fabled Passage|Mana Confluence|Multiversal Passage|Great Hall|Mistrise|Stormcarved|Shattered Sanctum|Cori Mountain/i;

export function isLandName(name: string): boolean {
  return BASIC_LAND_RE.test(name) || LAND_NAME_RE.test(name);
}
