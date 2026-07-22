import { useMemo, useState } from "react";
import { timeAgo } from "../../services/tracker";
import { CardArtStrip } from "../CardArt";
import { tallyMatches } from "../../services/statsHelpers";
import {
  DECK_SORT_DEFAULTS,
  sortDecks,
  type DeckGroup,
  type DeckSortKey,
} from "../../services/deckStats";
import { latestMainboard } from "../../services/deckVersions";
import {
  nextSort,
  pickArenaPreview,
  RateBar,
  SortHeaderBtn,
  useArenaCardMap,
  type SortDir,
} from "./statsUi";

export function DeckBreakdown({
  decks,
  onSelect,
}: {
  decks: DeckGroup[];
  onSelect: (key: string) => void;
}) {
  // Default: most recently played first — the table people open mid-session.
  const [sort, setSort] = useState<{ key: DeckSortKey; dir: SortDir }>({
    key: "last",
    dir: "desc",
  });
  const sorted = useMemo(
    () => sortDecks(decks, sort.key, sort.dir),
    [decks, sort.key, sort.dir],
  );

  const previewIds = useMemo(() => {
    const ids = new Set<number>();
    for (const d of decks) {
      const main = latestMainboard(d.matches);
      if (!main) continue;
      // Cap per deck so we don't request the whole 60.
      const counts = new Map<number, number>();
      for (const id of main) counts.set(id, (counts.get(id) ?? 0) + 1);
      const top = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([id]) => id);
      for (const id of top) ids.add(id);
    }
    return [...ids];
  }, [decks]);
  const cards = useArenaCardMap(previewIds);

  if (decks.length === 0) return null;

  const setCol = (key: DeckSortKey) =>
    setSort((cur) => nextSort(key, cur, DECK_SORT_DEFAULTS));

  return (
    <div className="panel">
      <h3 className="dash-title" title="Every deck you’ve piloted in the current filter">
        Your decks
      </h3>
      <div className="meta-bars deck-bars-art">
        <div
          className="meta-bar-row deck-wr-row deck-row-btn deck-sort-head deck-row-with-art deck-row-rich"
          role="row"
        >
          <span className="deck-row-art-spacer" aria-hidden="true" />
          <SortHeaderBtn
            label="Deck"
            active={sort.key === "name"}
            dir={sort.dir}
            tip="Sort alphabetically by deck name"
            onClick={() => setCol("name")}
          />
          <SortHeaderBtn
            label="Record"
            active={sort.key === "rate"}
            dir={sort.dir}
            align="center"
            tip="Sort by win rate (W–L of decided games)"
            onClick={() => setCol("rate")}
          />
          <SortHeaderBtn
            label="Games"
            active={sort.key === "matches"}
            dir={sort.dir}
            align="center"
            tip="Sort by number of matches on this deck"
            onClick={() => setCol("matches")}
          />
          <SortHeaderBtn
            label="Last played"
            active={sort.key === "last"}
            dir={sort.dir}
            align="right"
            tip="Sort by most recent match on this deck"
            onClick={() => setCol("last")}
          />
          <span className="deck-row-chevron" aria-hidden="true" />
        </div>
        {sorted.map((d) => {
          const t = tallyMatches(d.matches);
          const arts = pickArenaPreview(latestMainboard(d.matches), cards, 4);
          const lastAbs = new Date(d.lastPlayedAt).toLocaleString();
          const firstAbs = new Date(d.firstPlayedAt).toLocaleString();
          const rowTip = [
            d.name,
            t.decided > 0
              ? `${t.wins}W–${t.losses}L · ${Math.round((t.rate ?? 0) * 100)}%`
              : "No decided games",
            `${d.matches.length} match${d.matches.length === 1 ? "" : "es"}`,
            `Last played ${lastAbs}`,
            `First seen ${firstAbs}`,
            d.runActive ? "Fresh run active" : null,
            "Click for full breakdown",
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <button
              key={d.key}
              type="button"
              className="meta-bar-row deck-wr-row deck-row-btn deck-row-with-art deck-row-rich"
              onClick={() => onSelect(d.key)}
              title={rowTip}
            >
              <span className="deck-row-art" aria-hidden="true">
                {arts.length > 0 ? (
                  <CardArtStrip cards={arts} max={4} />
                ) : (
                  <span className="deck-row-art-empty" />
                )}
              </span>
              <span className="meta-bar-label">
                <span className="meta-bar-name">{d.name}</span>
                {d.runActive && (
                  <span
                    className="run-badge"
                    title="Fresh run is on — older matches for this deck are hidden from stats"
                  >
                    run
                  </span>
                )}
              </span>
              <span className="deck-row-record">
                <RateBar
                  wins={t.wins}
                  losses={t.losses}
                  tip={`${d.name}: ${t.wins}W–${t.losses}L of ${t.decided} decided · ${d.matches.length} total matches`}
                />
              </span>
              <span
                className="deck-row-games text-xs text-muted"
                title={`${d.matches.length} match${d.matches.length === 1 ? "" : "es"} on this list (including draws / unknowns)`}
              >
                {d.matches.length}
              </span>
              <span
                className="deck-row-last text-xs text-muted"
                title={`Last match: ${lastAbs}\nFirst seen: ${firstAbs}`}
              >
                {timeAgo(d.lastPlayedAt)}
              </span>
              <span className="deck-row-chevron" title="Open deck detail">
                ›
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted m-0 mt-2" title="Column headers toggle sort direction">
        Click a column header to sort · default is last played (newest first) · click a deck for
        its full breakdown.
      </p>
    </div>
  );
}
