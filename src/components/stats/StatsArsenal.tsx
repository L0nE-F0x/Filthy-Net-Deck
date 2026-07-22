import { useMemo } from "react";
import { CardArt } from "../CardArt";
import { sortDecks, type DeckGroup } from "../../services/deckStats";
import { latestMainboard } from "../../services/deckVersions";
import { pickArenaPreview, useArenaCardMap } from "./statsUi";

/** Hero fan of cards from your most-played decks — livens up the Stats home. */
export function StatsArsenal({
  decks,
  onSelect,
}: {
  decks: DeckGroup[];
  onSelect: (key: string) => void;
}) {
  const top = useMemo(() => sortDecks(decks, "matches", "desc").slice(0, 4), [decks]);
  const ids = useMemo(() => {
    const out = new Set<number>();
    for (const d of top) {
      const main = latestMainboard(d.matches);
      if (!main) continue;
      const counts = new Map<number, number>();
      for (const id of main) counts.set(id, (counts.get(id) ?? 0) + 1);
      for (const [id] of [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
        out.add(id);
      }
    }
    return [...out];
  }, [top]);
  const cards = useArenaCardMap(ids);

  const fans = top
    .map((d) => ({
      deck: d,
      arts: pickArenaPreview(latestMainboard(d.matches), cards, 3),
    }))
    .filter((f) => f.arts.length > 0);

  if (fans.length === 0) return null;

  return (
    <div className="panel stats-arsenal">
      <div className="stats-arsenal-copy">
        <h3 className="dash-title m-0">Your arsenal</h3>
        <p className="text-sm text-muted m-0 leading-relaxed">
          Signature cards from the decks you&apos;ve been grinding this filter.
        </p>
      </div>
      <div className="stats-arsenal-fans">
        {fans.map(({ deck, arts }) => (
          <button
            key={deck.key}
            type="button"
            className="stats-arsenal-fan"
            title={`${deck.name} — open deck stats & decklist`}
            onClick={() => onSelect(deck.key)}
          >
            {arts.map((c, i) => (
              <div
                key={`${c.name}-${i}`}
                className={`stats-arsenal-card stats-arsenal-card-${i}`}
                style={{ zIndex: arts.length - i }}
              >
                <CardArt
                  name={c.name}
                  scryfallId={c.scryfallId}
                  size="normal"
                  rounded={false}
                  className="stats-arsenal-img"
                />
              </div>
            ))}
            <span className="stats-arsenal-label">{deck.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
