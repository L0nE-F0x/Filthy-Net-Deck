import { useEffect, useState } from "react";
import { resolveCardImage } from "../services/scryfall";
import type { CardEntry, Deck } from "../types/meta";

/** Minimal reference to a card for art purposes. */
export interface ArtRef {
  name: string;
  scryfallId?: string;
}

export function CardArt({
  name,
  scryfallId,
  size = "small",
  className = "",
  rounded = true,
}: {
  name: string;
  scryfallId?: string;
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
    void resolveCardImage(name, size, scryfallId).then((uri) => {
      if (cancelled) return;
      if (uri) setSrc(uri);
      else setFailed(true);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [name, size, scryfallId]);

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
export function CardArtStrip({ cards, max = 5 }: { cards: ArtRef[]; max?: number }) {
  const shown = cards.slice(0, max);
  if (!shown.length) return null;
  return (
    <div className="card-art-strip">
      {shown.map((c, i) => (
        <div
          key={`${c.name}-${i}`}
          className="card-art-strip-item"
          style={{ zIndex: max - i }}
        >
          <CardArt
            name={c.name}
            scryfallId={c.scryfallId}
            size="art_crop"
            className="card-art-thumb"
          />
        </div>
      ))}
    </div>
  );
}

const BASIC_LAND_RE = /^(Plains|Island|Swamp|Mountain|Forest|Snow-Covered|Wastes)/i;
const LAND_NAME_RE =
  /Verge$|Pathway$|Canal$|Reef$|Shores$|Coast$|Fountain$|Vents$|Crypt$|Tomb$|Town$|Sewers$|Archive$|Falls$|Theater$|Backstreet$|District$|Maze$|Portico$|Monastery$|Village$|^Restless |^Starting Town|Brushland|Razorverge|Llanowar Wastes|Underground River|Shivan Reef|Adarkar|Battlefield Forge|Caves of Koilos|Concealed Courtyard|Blooming Marsh|Blackcleave|Inspiring Vantage|Spirebluff|Seachrome|Darkslick|Hushwood|Wastewood|Floodfarm|Gloomlake|Commercial District|Hedge Maze|Lush Portico|Meticulous|Shadowy|Undercity|Thundering|Raucous|Boseiju|Otawara|Eiganjo|Takenuma|Sokenzan|Lair of the Hydra|Rockface|Den of the Bugbear|Command Tower|Breeding Pool|Hallowed Fountain|Watery Grave|Overgrown Tomb|Temple Garden|Godless Shrine|Blood Crypt|Steam Vents|Sacred Foundry|Stomping Ground|Flooded Strand|Polluted Delta|Misty Rainforest|Windswept Heath|Wooded Foothills|Bloodstained Mire|Marsh Flats|Scalding Tarn|Arid Mesa|Verdant Catacombs|Fabled Passage|Mana Confluence|Multiversal Passage|Great Hall|Mistrise|Stormcarved|Shattered Sanctum|Cori Mountain/i;

function isLand(entry: CardEntry): boolean {
  if (entry.land != null) return entry.land;
  return BASIC_LAND_RE.test(entry.name) || LAND_NAME_RE.test(entry.name);
}

/**
 * Pick preview cards for a deck's art strip.
 * Priority: commander → pipeline-provided key cards (from the metagame
 * source, i.e. the archetype's signature cards) → highest-count nonland
 * mainboard cards. scryfallIds are pulled from the list when available.
 */
export function pickPreviewCards(
  deck: Pick<Deck, "mainboard" | "commander" | "keyCards">,
): ArtRef[] {
  const byName = new Map<string, CardEntry>();
  for (const c of deck.mainboard) byName.set(c.name.toLowerCase(), c);

  const out: ArtRef[] = [];
  const seen = new Set<string>();
  const push = (name: string) => {
    const k = name.toLowerCase();
    if (!name || seen.has(k)) return;
    seen.add(k);
    out.push({ name: byName.get(k)?.name ?? name, scryfallId: byName.get(k)?.scryfallId });
  };

  if (deck.commander) push(deck.commander);
  for (const k of deck.keyCards ?? []) push(k);

  const nonLands = [...deck.mainboard]
    .filter((c) => !isLand(c))
    .sort((a, b) => b.count - a.count);
  for (const c of nonLands) push(c.name);

  return out;
}
