import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import {
  currentSeasonKey,
  deckKey,
  exportTrackerCsv,
  queueLabel,
  seasonKeyOf,
  seasonLabel,
} from "../services/tracker";
import { recapFromMatches, renderRecapPng } from "../services/recapCard";
import { formatRecapHeadline } from "../services/recapStats";
import {
  communityShareOptions,
  deliverShare,
  recapCaption,
  type ShareDestination,
} from "../services/communityShare";
import { loadDeckRuns, type DeckRuns } from "../services/deckRuns";
import { formatRank, winrateFavor } from "../services/ranks";
import {
  buildInsightChips,
  buildSeasonStory,
  compareDecks,
} from "../services/statsInsights";
import { TrackerOnboarding } from "../components/TrackerOnboarding";
import { ShareMenu } from "../components/ShareMenu";
import { groupDecks } from "../services/deckStats";
import { QueueAnalyticsPanel } from "../components/QueueAnalyticsPanel";
import {
  DeckBreakdown,
  DeckDetail,
  FormTiles,
  MatchHistory,
  SplitsPanel,
  StatsArsenal,
  StatusPanel,
  SummaryTiles,
} from "../components/stats";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function Stats() {
  const matches = useAppStore((s) => s.trackerMatches);
  const status = useAppStore((s) => s.trackerStatus);
  const clearTracker = useAppStore((s) => s.clearTracker);
  const refreshTracker = useAppStore((s) => s.refreshTracker);
  const statsFocusDeckKey = useAppStore((s) => s.statsFocusDeckKey);
  const statsCompareDeckKey = useAppStore((s) => s.statsCompareDeckKey);
  const clearStatsFocusDeck = useAppStore((s) => s.clearStatsFocusDeck);
  const clearStatsCompareDeck = useAppStore((s) => s.clearStatsCompareDeck);
  const openMatchupOpponent = useAppStore((s) => s.openMatchupOpponent);
  const [queue, setQueue] = useState<string | null>(null);
  const [seasonSel, setSeasonSel] = useState<string | null>(null); // null = auto
  const [selectedDeck, setSelectedDeck] = useState<string | null>(null);
  const [compareWith, setCompareWith] = useState<string | null>(null);
  const [runs, setRuns] = useState<DeckRuns>(() => loadDeckRuns());
  const [confirmClear, setConfirmClear] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [recapMsg, setRecapMsg] = useState<string | null>(null);

  // Re-sync from disk when opening My Stats (covers tray-missed live events).
  useEffect(() => {
    void refreshTracker();
  }, [refreshTracker]);

  // Climb / Matchups can deep-link into a deck detail or compare view.
  useEffect(() => {
    if (!statsFocusDeckKey) return;
    setSelectedDeck(statsFocusDeckKey);
    if (statsCompareDeckKey) setCompareWith(statsCompareDeckKey);
    else setCompareWith(null);
    clearStatsFocusDeck();
    clearStatsCompareDeck();
  }, [
    statsFocusDeckKey,
    statsCompareDeckKey,
    clearStatsFocusDeck,
    clearStatsCompareDeck,
  ]);

  const onExportCsv = () => {
    setExportMsg("Exporting…");
    void exportTrackerCsv()
      .then((path) => setExportMsg(`Saved to ${path}`))
      .catch((e) =>
        setExportMsg(e instanceof Error ? e.message : "Export failed."),
      );
  };

  // Fresh runs hide a deck's older matches from every stat (never deleted).
  const runFiltered = useMemo(
    () => matches.filter((m) => m.endedAt >= (runs[deckKey(m)] ?? 0)),
    [matches, runs],
  );
  const hiddenByRuns = matches.length - runFiltered.length;

  const seasons = useMemo(
    () => [...new Set(runFiltered.map((m) => seasonKeyOf(m.endedAt)))].sort().reverse(),
    [runFiltered],
  );
  // Ranked seasons reset monthly, so default to the current one when it has games.
  const season =
    seasonSel ?? (seasons.includes(currentSeasonKey()) ? currentSeasonKey() : "all");

  const seasonFiltered = useMemo(
    () =>
      season === "all"
        ? runFiltered
        : runFiltered.filter((m) => seasonKeyOf(m.endedAt) === season),
    [runFiltered, season],
  );

  const queues = useMemo(() => {
    const ids = new Set(seasonFiltered.map((m) => m.eventId));
    return [...ids].sort();
  }, [seasonFiltered]);

  const filtered = useMemo(
    () => (queue ? seasonFiltered.filter((m) => m.eventId === queue) : seasonFiltered),
    [seasonFiltered, queue],
  );

  const decks = useMemo(() => groupDecks(filtered, runs), [filtered, runs]);

  // Deck detail is season/queue-agnostic: it's the deck's whole story.
  const selected = useMemo(() => {
    if (!selectedDeck) return null;
    const deckMatches = matches.filter((m) => deckKey(m) === selectedDeck);
    if (deckMatches.length === 0) return null;
    const groups = groupDecks(deckMatches, runs);
    return groups[0] ?? null;
  }, [selectedDeck, matches, runs]);

  const insights = useMemo(
    () => buildInsightChips(matches, { seasonKey: season === "all" ? null : season }),
    [matches, season],
  );
  const seasonStory = useMemo(
    () => buildSeasonStory(matches, season),
    [matches, season],
  );
  const comparison =
    selectedDeck && compareWith
      ? compareDecks(matches, selectedDeck, compareWith)
      : null;

  if (selected && comparison && compareWith) {
    return (
      <div className="flex flex-col gap-3">
        <div className="panel">
          <button
            type="button"
            className="btn btn-ghost btn-sm mb-2"
            onClick={() => {
              setCompareWith(null);
            }}
          >
            ‹ Back to deck
          </button>
          <h3 className="dash-title m-0 mb-3">Deck compare</h3>
          <div className="deck-compare-grid">
            {[comparison.a, comparison.b].map((side) => (
              <div key={side.key} className="panel deck-compare-card">
                <h4 className="m-0 text-sm font-semibold">{side.name}</h4>
                <p className="text-xs text-muted m-0 mt-1">
                  {side.wins}W {side.losses}L
                  {side.rate != null && (
                    <strong className={`favor-${winrateFavor(side.rate)}`}>
                      {" "}
                      {(side.rate * 100).toFixed(0)}%
                    </strong>
                  )}
                </p>
                <ul className="text-xs m-0 mt-2 pl-4 text-muted">
                  <li>
                    Play WR:{" "}
                    {side.playRate != null
                      ? `${(side.playRate * 100).toFixed(0)}%`
                      : "—"}
                  </li>
                  <li>
                    Draw WR:{" "}
                    {side.drawRate != null
                      ? `${(side.drawRate * 100).toFixed(0)}%`
                      : "—"}
                  </li>
                  <li>
                    Last 10:{" "}
                    {side.form10 != null ? `${(side.form10 * 100).toFixed(0)}%` : "—"}
                  </li>
                  <li>Peak: {side.peakRank ? formatRank(side.peakRank) : "—"}</li>
                </ul>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm mt-2"
                  onClick={() => {
                    setCompareWith(null);
                    setSelectedDeck(side.key);
                  }}
                >
                  Open {side.name}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (selected) {
    return (
      <DeckDetail
        deck={selected}
        runs={runs}
        setRuns={setRuns}
        onBack={() => {
          setSelectedDeck(null);
          setCompareWith(null);
        }}
        allMatches={matches}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <StatusPanel />

      {matches.length === 0 ? (
        status?.logFound && status.detailedLogs !== false ? (
          <div className="panel">
            <h2 className="text-lg font-semibold m-0 mb-2">No matches recorded yet</h2>
            <p className="text-sm text-muted m-0 mb-3 leading-relaxed max-w-xl">
              Keep Filthy Net Deck running (or in the tray) while you play — every match lands
              here the moment it ends.
            </p>
            <TrackerOnboarding showHealthDetail={false} />
          </div>
        ) : null
      ) : (
        <>
          {seasons.length > 1 && (
            <div className="filter-bar mb-0">
              {seasons.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`filter-chip${season === s ? " active" : ""}`}
                  onClick={() => setSeasonSel(s)}
                >
                  {seasonLabel(s)}
                </button>
              ))}
              <button
                type="button"
                className={`filter-chip${season === "all" ? " active" : ""}`}
                onClick={() => setSeasonSel("all")}
              >
                All time
              </button>
            </div>
          )}

          {queues.length > 1 && (
            <div className="filter-bar mb-0">
              <button
                type="button"
                className={`filter-chip${queue === null ? " active" : ""}`}
                onClick={() => setQueue(null)}
              >
                All queues
              </button>
              {queues.map((q) => (
                <button
                  key={q}
                  type="button"
                  className={`filter-chip${queue === q ? " active" : ""}`}
                  onClick={() => setQueue(q)}
                >
                  {queueLabel(q)}
                </button>
              ))}
            </div>
          )}

          <div className="panel season-story">
            <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
            <p className="eyebrow m-0 mb-1">Season story</p>
            <p className="text-sm m-0">
              {seasonStory.wins}W {seasonStory.losses}L
              {seasonStory.rate != null && (
                <strong className={`favor-${winrateFavor(seasonStory.rate)}`}>
                  {" "}
                  {(seasonStory.rate * 100).toFixed(0)}%
                </strong>
              )}
              {seasonStory.peakRank && (
                <>
                  {" "}
                  · peak <strong className="text-gold-300">{formatRank(seasonStory.peakRank)}</strong>
                </>
              )}
              {seasonStory.bestDeckName && (
                <>
                  {" "}
                  · best{" "}
                  <button
                    type="button"
                    className="link-btn text-foam"
                    onClick={() =>
                      seasonStory.bestDeckKey && setSelectedDeck(seasonStory.bestDeckKey)
                    }
                  >
                    {seasonStory.bestDeckName}
                  </button>
                  {seasonStory.bestDeckRate != null && (
                    <span className="text-muted">
                      {" "}
                      ({(seasonStory.bestDeckRate * 100).toFixed(0)}%)
                    </span>
                  )}
                </>
              )}
            </p>
            {recapMsg && <p className="text-xs m-0 mt-1 text-foam">{recapMsg}</p>}
            </div>
            <ShareMenu
              label="Share week recap"
              hint="WR, rank move, best deck — save PNG or post"
              options={communityShareOptions("local week only")}
              onPick={async (id) => {
                const dest = id as ShareDestination;
                const stats = recapFromMatches(matches);
                setRecapMsg(`${formatRecapHeadline(stats)} — rendering…`);
                try {
                  const blob = await renderRecapPng(stats, {
                    kicker: "Weekly recap · local only",
                  });
                  const caption = recapCaption({
                    wins: stats.wins,
                    losses: stats.losses,
                    rankDeltaLabel: stats.rankDeltaLabel,
                    bestDeckName: stats.bestDeck?.name ?? null,
                  });
                  const result = await deliverShare({
                    destination: dest,
                    blob,
                    filename: "filthy-net-deck-recap.png",
                    caption,
                  });
                  setRecapMsg(result.message);
                  if (!result.ok) throw new Error(result.message);
                  return result.message;
                } catch (e) {
                  const msg =
                    e instanceof Error ? e.message : "Could not render recap.";
                  setRecapMsg(msg);
                  throw e;
                }
              }}
            />
            </div>
          </div>

          {insights.length > 0 && (
            <div className="insight-chips" aria-live="polite">
              {insights.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`insight-chip insight-${c.kind}${c.deckKey ? "" : " no-nav"}`}
                  onClick={() => c.deckKey && setSelectedDeck(c.deckKey)}
                  disabled={!c.deckKey}
                >
                  <strong>{c.label}</strong>
                  <span>{c.detail}</span>
                </button>
              ))}
            </div>
          )}

          <SummaryTiles matches={filtered} />
          <FormTiles matches={filtered} />
          <QueueAnalyticsPanel matches={filtered} />
          <StatsArsenal decks={decks} onSelect={setSelectedDeck} />
          <SplitsPanel matches={filtered} />
          <DeckBreakdown decks={decks} onSelect={setSelectedDeck} />
          <MatchHistory
            matches={filtered}
            onOpponent={(name) => openMatchupOpponent(name)}
            onDeck={(key) => setSelectedDeck(key)}
          />

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs text-muted m-0">
              Matches are read from Arena's own log and stored only on this PC.
              {hiddenByRuns > 0 && (
                <>
                  {" "}
                  {hiddenByRuns} match{hiddenByRuns === 1 ? "" : "es"} hidden by fresh runs.
                </>
              )}
            </p>
            {confirmClear ? (
              <span className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ background: "var(--color-poor)", color: "#1a0505" }}
                  onClick={() => {
                    setConfirmClear(false);
                    void clearTracker();
                  }}
                >
                  Really delete all history
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setConfirmClear(false)}
                >
                  Keep it
                </button>
              </span>
            ) : (
              <span className="flex gap-2 items-center flex-wrap">
                {exportMsg && (
                  <span className="text-xs text-muted selectable">{exportMsg}</span>
                )}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  title="Save every match as a CSV file in your Downloads folder"
                  onClick={onExportCsv}
                >
                  Export CSV
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setConfirmClear(true)}
                >
                  Clear history
                </button>
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
