import { useEffect, useState } from "react";
import { resolveCardImage } from "../services/scryfall";

export function CardArt({
  name,
  size = "small",
  className = "",
  rounded = true,
}: {
  name: string;
  size?: "small" | "normal" | "art_crop";
  className?: string;
  rounded?: boolean;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setLoading(true);
    setSrc(null);
    if (!name?.trim()) {
      setFailed(true);
      setLoading(false);
      return;
    }
    void resolveCardImage(name, size).then((uri) => {
      if (cancelled) return;
      if (uri) setSrc(uri);
      else setFailed(true);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [name, size]);

  if (loading) {
    return (
      <div
        className={`card-art-fallback card-art-loading ${rounded ? "rounded-lg" : ""} ${className}`}
        title={name}
        aria-hidden
      />
    );
  }

  if (failed || !src) {
    return (
      <div
        className={`card-art-fallback ${rounded ? "rounded-lg" : ""} ${className}`}
        title={`${name} (art unavailable)`}
      >
        <span>{name.slice(0, 1).toUpperCase()}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      title={name}
      loading="lazy"
      referrerPolicy="no-referrer"
      className={`card-art ${rounded ? "rounded-lg" : ""} ${className}`}
      onError={() => setFailed(true)}
    />
  );
}

/** Horizontal strip of key cards for a deck */
export function CardArtStrip({
  names,
  max = 5,
}: {
  names: string[];
  max?: number;
}) {
  const shown = names.slice(0, max);
  if (!shown.length) return null;
  return (
    <div className="card-art-strip">
      {shown.map((n, i) => (
        <div key={`${n}-${i}`} className="card-art-strip-item" style={{ zIndex: max - i }}>
          <CardArt name={n} size="art_crop" className="card-art-thumb" />
        </div>
      ))}
    </div>
  );
}

/** Prefer iconic, usually-Scryfall-stable cards for previews */
const PREFERRED_PREVIEW = [
  "Slickshot Show-Off",
  "Stormchaser's Talent",
  "Eddymurk Crab",
  "Drake Hatcher",
  "Opt",
  "Sleight of Hand",
  "Burst Lightning",
  "Flow State",
  "Boomerang Basics",
  "Badgermole Cub",
  "Brightglass Gearhulk",
  "Llanowar Elves",
  "Get Lost",
  "Deep-Cavern Bat",
  "Stock Up",
  "Counterspell",
  "Sol Ring",
  "Rhystic Study",
  "Swords to Plowshares",
  "Lightning Bolt",
  "Thoughtseize",
  "Fatal Push",
  "Ragavan, Nimble Pilferer",
];

export function pickPreviewCards(
  mainboard: { name: string; count: number }[],
  commander?: string,
): string[] {
  const names = mainboard.map((c) => c.name);
  const nonLands = mainboard
    .filter(
      (c) =>
        !/^(Plains|Island|Swamp|Mountain|Forest|Snow-Covered|Wastes)/i.test(c.name) &&
        !/Verge$|Pathway$|Canal$|Reef$|Shores$|Coast$|Fountain$|Vents$|Crypt$|Tomb$|Town$|Sewers$|Archive$|Falls$|Theater$|Backstreet$|District$|Maze$|Portico$|Restless |Starting Town|Brushland|Razorverge|Llanowar Wastes|Underground River|Shivan Reef|Adarkar|Battlefield Forge|Caves of Koilos|Concealed Courtyard|Blooming Marsh|Blackcleave|Inspiring Vantage|Spirebluff|Seachrome|Darkslick|Hushwood|Wastewood|Floodfarm|Gloomlake|Commercial District|Hedge Maze|Lush Portico|Meticulous|Shadowy|Undercity|Thundering|Raucous|Boseiju|Otawara|Eiganjo|Takenuma|Sokenzan|Lair of the Hydra|Rockface|Den of the Bugbear|Command Tower|Breeding Pool|Hallowed Fountain|Watery Grave|Overgrown Tomb|Temple Garden|Godless Shrine|Blood Crypt|Steam Vents|Sacred Foundry|Stomping Ground|Flooded Strand|Polluted Delta|Misty Rainforest|Fabled Passage|Mana Confluence/i.test(
          c.name,
        ),
    )
    .sort((a, b) => b.count - a.count)
    .map((c) => c.name);

  const preferred = PREFERRED_PREVIEW.filter((p) =>
    names.some((n) => n.toLowerCase() === p.toLowerCase()),
  );
  const rest = nonLands.filter(
    (n) => !preferred.some((p) => p.toLowerCase() === n.toLowerCase()),
  );
  const ordered = [...preferred, ...rest];
  if (commander) {
    return [commander, ...ordered.filter((n) => n !== commander)];
  }
  return ordered;
}
