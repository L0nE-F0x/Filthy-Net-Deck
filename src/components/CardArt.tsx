import { useState } from "react";
import { scryfallImageUrl } from "../services/scryfall";

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
  const [failed, setFailed] = useState(false);
  if (failed || !name) {
    return (
      <div
        className={`card-art-fallback ${rounded ? "rounded-lg" : ""} ${className}`}
        title={name}
      >
        <span>{name.slice(0, 1)}</span>
      </div>
    );
  }
  return (
    <img
      src={scryfallImageUrl(name, size === "art_crop" ? "art_crop" : size)}
      alt={name}
      title={name}
      loading="lazy"
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

export function pickPreviewCards(
  mainboard: { name: string; count: number }[],
  commander?: string,
): string[] {
  const nonLands = mainboard
    .filter(
      (c) =>
        !/^(Plains|Island|Swamp|Mountain|Forest|Snow-Covered|Wastes)/i.test(c.name) &&
        !/Verge$|Pathway$|Canal$|Reef$|Shores$|Coast$|Fountain$|Vents$|Crypt$|Tomb$|Town$|Sewers$|Archive$|Falls$|Theater$|Backstreet$|District$|Maze$|Portico$|Restless |Starting Town|Brushland|Razorverge|Llanowar Wastes|Underground River|Shivan Reef|Adarkar|Battlefield Forge|Caves of Koilos|Concealed Courtyard|Blooming Marsh|Blackcleave|Inspiring Vantage|Spirebluff|Seachrome|Darkslick|Hushwood|Wastewood|Floodfarm|Gloomlake|Commercial District|Hedge Maze|Lush Portico|Meticulous|Shadowy|Undercity|Thundering|Raucous|Boseiju|Otawara|Eiganjo|Takenuma|Sokenzan|Lair of the Hydra|Rockface|Den of the Bugbear/i.test(
          c.name,
        ),
    )
    .sort((a, b) => b.count - a.count)
    .map((c) => c.name);
  if (commander) return [commander, ...nonLands.filter((n) => n !== commander)];
  return nonLands;
}
