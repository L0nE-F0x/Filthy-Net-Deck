import { useMemo, useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import {
  currentSeasonKey,
  deckKey,
  seasonKeyOf,
} from "../../services/tracker";
import {
  dayWindow,
  lastSevenDaysWindow,
  sessionWindow,
} from "../../services/recapStats";
import { aggregateDeck, downloadDeckSharePng } from "../../services/deckShare";
import { endDeckRun, startDeckRun, type DeckRuns } from "../../services/deckRuns";
import { formatRank, parseRank, winrateFavor } from "../../services/ranks";
import { currentStreak } from "../../services/climbStats";
import {
  resolveArenaCards,
  type ArenaCardInfo,
} from "../../services/arenaCards";
import { resolveMetaDeck } from "../../services/deepLinks";
import { CardArt, CardArtStrip } from "../CardArt";
import { TrackedDecklist } from "../TrackedDecklist";
import { GameAnalyticsPanel } from "../GameAnalyticsPanel";
import { ShareMenu } from "../ShareMenu";
import type { TrackedMatch } from "../../types/tracker";
import { tallyMatches } from "../../services/statsHelpers";
import { type DeckGroup } from "../../services/deckStats";
import { QueueAnalyticsPanel } from "../QueueAnalyticsPanel";
import {
  buildVersions,
  diffLists,
  latestDecklist,
  latestMainboard,
} from "../../services/deckVersions";
import { SummaryTiles } from "./SummaryTiles";
import { SplitsPanel } from "./SplitsPanel";
import { MatchHistory } from "./MatchHistory";
import { pickArenaPreview, useArenaCardMap } from "./statsUi";

/* -- Deck share card (decklist + record + FND logo, for posting) -- */
type DeckShareScope = "all" | "season" | "run" | "session" | "day" | "week";

function scopedMatches(
  scope: DeckShareScope,
  matches: TrackedMatch[],
  runStart: number | undefined,
): TrackedMatch[] {
  if (scope === "all") return matches;
  if (scope === "run")
    return runStart !== undefined
      ? matches.filter((m) => m.endedAt >= runStart)
      : matches;
  if (scope === "season") {
    const s = currentSeasonKey();
    return matches.filter((m) => seasonKeyOf(m.endedAt) === s);
  }
  const w =
    scope === "day"
      ? dayWindow()
      : scope === "session"
        ? sessionWindow(matches)
        : lastSevenDaysWindow();
  return matches.filter((m) => m.endedAt >= w.fromMs && m.endedAt <= w.toMs);
}

async function shareDeckCard(
  scope: DeckShareScope,
  deckName: string,
  deckList: { main: number[]; side?: number[] },
  matches: TrackedMatch[],
  runStart: number | undefined,
): Promise<void> {
  const ms = scopedMatches(scope, matches, runStart);
  let wins = 0;
  let losses = 0;
  let draws = 0;
  for (const m of ms) {
    if (m.result === "win") wins++;
    else if (m.result === "loss") losses++;
    else if (m.result === "draw") draws++;
  }
  const decided = wins + losses;
  const ranked = ms
    .map((m) => ({ at: m.endedAt, r: parseRank(m.myRank) }))
    .filter(
      (x): x is { at: number; r: NonNullable<ReturnType<typeof parseRank>> } =>
        x.r != null,
    )
    .sort((a, b) => a.at - b.at);
  const peak = ranked.length
    ? ranked.reduce((b, x) => (x.r.score > b.r.score ? x : b), ranked[0])
    : null;
  const streak = currentStreak(ms);

  // Resolve with full meta so grouping + mana colors are accurate even for
  // cards seen before the 0.19 cache upgrade.
  const cards = await resolveArenaCards([...new Set(deckList.main)], {
    full: true,
  });
  const list = aggregateDeck(deckList.main, deckList.side, cards);

  await downloadDeckSharePng({
    scope,
    deckName,
    list,
    wins,
    losses,
    draws,
    winratePct: decided ? Math.round((wins / decided) * 100) : null,
    games: ms.length,
    rankNow: ranked.length ? formatRank(ranked[ranked.length - 1].r) : null,
    rankPeak: peak ? formatRank(peak.r) : null,
    bestOf: ms.length ? ms[0].bestOf : null,
    streakLabel:
      streak.type && streak.length > 1
        ? `${streak.type} streak ×${streak.length}`
        : null,
  });
}

function ShareDeckButton(props: {
  deckName: string;
  deckList: { main: number[]; side?: number[] } | undefined;
  matches: TrackedMatch[];
  runStart: number | undefined;
}) {
  const { deckName, deckList, matches, runStart } = props;
  if (!deckList) return null;
  const options = [
    {
      id: "all" as const,
      label: "All-time on this deck",
      detail: "Full history · list + W–L + peak rank",
    },
    {
      id: "season" as const,
      label: "This ranked season",
      detail: "Current month ladder window",
    },
    ...(runStart !== undefined
      ? [
          {
            id: "run" as const,
            label: "This fresh run",
            detail: "Since you started the run",
          },
        ]
      : []),
    {
      id: "session" as const,
      label: "This session",
      detail: "Today’s play block",
    },
    {
      id: "day" as const,
      label: "Today",
      detail: "Calendar day so far",
    },
    {
      id: "week" as const,
      label: "Last 7 days",
      detail: "Rolling week on this deck",
    },
  ];
  return (
    <ShareMenu
      label="Share deck card"
      hint="Branded PNG — decklist, record, FND mark. Pick a time window."
      options={options}
      onPick={(id) => shareDeckCard(id as DeckShareScope, deckName, deckList, matches, runStart)}
    />
  );
}

function DiffArt({
  main,
  side,
  cards,
}: {
  main: { id: number; delta: number }[];
  side: { id: number; delta: number }[];
  cards: Record<number, ArenaCardInfo>;
}) {
  const items = [
    ...main.map((d) => ({ ...d, sb: false })),
    ...side.map((d) => ({ ...d, sb: true })),
  ];
  if (items.length === 0) return null;

  return (
    <div className="diff-art-row" role="list">
      {items.map((d) => {
        const info = cards[d.id];
        const name = info?.name ?? `Card #${d.id}`;
        const add = d.delta > 0;
        return (
          <div
            key={`${d.sb ? "sb" : "mb"}-${d.id}`}
            className={`diff-art-card ${add ? "add" : "cut"}`}
            role="listitem"
            title={`${add ? "+" : "−"}${Math.abs(d.delta)} ${d.sb ? "SB " : ""}${name}`}
          >
            <div className="diff-art-frame">
              <CardArt
                name={info?.name ?? `Card ${d.id}`}
                scryfallId={info?.scryfallId}
                size="small"
                rounded={false}
                className="diff-art-img"
              />
              <span className="diff-art-badge" aria-hidden="true">
                {add ? `+${d.delta}` : `−${Math.abs(d.delta)}`}
              </span>
              {d.sb && <span className="diff-art-sb">SB</span>}
              <span className={`diff-art-glow ${add ? "add" : "cut"}`} aria-hidden="true" />
            </div>
            <span className="diff-art-name">{name}</span>
          </div>
        );
      })}
    </div>
  );
}

function VersionHistory({ deckMatches }: { deckMatches: TrackedMatch[] }) {
  const versions = useMemo(() => buildVersions(deckMatches), [deckMatches]);

  // Diff cards + a preview of each build's mainboard for art.
  const allIds = useMemo(() => {
    const ids = new Set<number>();
    for (const v of versions) {
      for (const id of v.main ?? []) ids.add(id);
      for (const id of v.side ?? []) ids.add(id);
    }
    for (let i = 1; i < versions.length; i++) {
      const prev = versions[i - 1];
      const cur = versions[i];
      if (prev.main && cur.main) {
        for (const d of diffLists(prev.main, cur.main)) ids.add(d.id);
        for (const d of diffLists(prev.side ?? [], cur.side ?? [])) ids.add(d.id);
      }
    }
    return [...ids];
  }, [versions]);

  const cards = useArenaCardMap(allIds);

  if (versions.length === 0) return null;

  if (versions.length === 1) {
    const only = versions[0];
    const preview = pickArenaPreview(only.main, cards, 5);
    return (
      <div className="panel">
        <h3 className="dash-title">Version history</h3>
        {preview.length > 0 && (
          <div className="ver-build-art mb-2">
            <CardArtStrip cards={preview} max={5} />
          </div>
        )}
        <p className="text-sm text-muted m-0 leading-relaxed">
          One build recorded so far. Change some cards in Arena and matches on the new list
          will show up here as a separate version — with mini card art for every swap and
          whether it plays better or worse.
        </p>
      </div>
    );
  }

  // Newest build first for display.
  const rows = versions.map((v, i) => ({ v, i })).reverse();

  return (
    <div className="panel">
      <h3 className="dash-title">Version history · {versions.length} builds</h3>
      <div className="ver-rows">
        {rows.map(({ v, i }) => {
          const t = tallyMatches(v.matches);
          const prev = i > 0 ? versions[i - 1] : null;
          const prevTally = prev ? tallyMatches(prev.matches) : null;
          const delta =
            t.rate != null && prevTally?.rate != null
              ? (t.rate - prevTally.rate) * 100
              : null;
          const mainDiff = prev?.main && v.main ? diffLists(prev.main, v.main) : null;
          const sideDiff =
            prev?.main && v.main ? diffLists(prev.side ?? [], v.side ?? []) : null;
          const buildPreview = pickArenaPreview(v.main, cards, 4);
          return (
            <div key={v.hash} className="ver-row">
              <div className="ver-head">
                <span className="font-semibold">
                  Build {i + 1}
                  {i === versions.length - 1 && (
                    <span className="text-gold-300"> · current</span>
                  )}
                </span>
                <span className="text-xs text-muted">
                  {new Date(v.firstAt).toLocaleDateString()}
                  {v.lastAt > v.firstAt ? ` – ${new Date(v.lastAt).toLocaleDateString()}` : ""}
                </span>
                <span className="ver-score">
                  {t.wins}W {t.losses}L
                  <strong className={t.rate != null ? `favor-${winrateFavor(t.rate)}` : ""}>
                    {t.rate != null ? ` ${(t.rate * 100).toFixed(0)}%` : " —"}
                  </strong>
                  {delta != null && (
                    <span className={delta >= 0 ? "favor-favored" : "favor-unfavored"}>
                      {" "}
                      {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(0)} pp
                    </span>
                  )}
                </span>
              </div>
              {buildPreview.length > 0 && (
                <div className="ver-build-art">
                  <CardArtStrip cards={buildPreview} max={4} />
                </div>
              )}
              {i > 0 &&
                (mainDiff ? (
                  mainDiff.length + (sideDiff?.length ?? 0) > 0 ? (
                    <DiffArt main={mainDiff} side={sideDiff ?? []} cards={cards} />
                  ) : (
                    <p className="text-xs text-muted m-0">Same 75 — sideboard shuffle only.</p>
                  )
                ) : (
                  <p className="text-xs text-muted m-0">
                    Card diff unavailable — one of these builds was recorded before deck lists
                    were stored.
                  </p>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DeckDetail({
  deck,
  runs,
  setRuns,
  onBack,
  allMatches,
}: {
  deck: DeckGroup;
  runs: DeckRuns;
  setRuns: (r: DeckRuns) => void;
  onBack: () => void;
  allMatches: TrackedMatch[];
}) {
  const deleteMatches = useAppStore((s) => s.deleteMatches);
  const meta = useAppStore((s) => s.meta);
  const openDeck = useAppStore((s) => s.openDeck);
  const openMatchupOpponent = useAppStore((s) => s.openMatchupOpponent);
  const openClimbDeck = useAppStore((s) => s.openClimbDeck);
  const openBrewLabDeck = useAppStore((s) => s.openBrewLabDeck);
  const openStatsCompare = useAppStore((s) => s.openStatsCompare);
  const openStatsDeck = useAppStore((s) => s.openStatsDeck);
  const setPage = useAppStore((s) => s.setPage);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [compareKey, setCompareKey] = useState<string>("");

  const metaHit = resolveMetaDeck(meta, deck.name);
  const otherDecks = useMemo(() => {
    const keys = new Map<string, string>();
    for (const m of allMatches) {
      const k = deckKey(m);
      if (k === deck.key) continue;
      if (!keys.has(k) && m.deckName) keys.set(k, m.deckName);
    }
    return [...keys.entries()].map(([key, name]) => ({ key, name }));
  }, [allMatches, deck.key]);

  const runStart = runs[deck.key];
  const hiddenByRun =
    runStart !== undefined ? deck.matches.filter((m) => m.endedAt < runStart).length : 0;
  const visibleMatches =
    runStart !== undefined && !showAll
      ? deck.matches.filter((m) => m.endedAt >= runStart)
      : deck.matches;

  const mainIds = useMemo(() => {
    const main = latestMainboard(deck.matches);
    if (!main) return [] as number[];
    return [...new Set(main)];
  }, [deck.matches]);
  const cardMap = useArenaCardMap(mainIds);
  const headerArts = pickArenaPreview(latestMainboard(deck.matches), cardMap, 6);
  const deckList = useMemo(() => latestDecklist(deck.matches), [deck.matches]);

  return (
    <div className="flex flex-col gap-3">
      <div className="panel deck-detail-hero">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="flex items-center gap-2 min-w-0">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
              ‹ All decks
            </button>
            <h3 className="dash-title m-0 truncate">{deck.name}</h3>
          </span>
          <span className="flex items-center gap-2 flex-wrap">
            {runStart === undefined ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                title="Hide this deck's past matches and count the winrate from zero (nothing is deleted)"
                onClick={() => setRuns(startDeckRun(deck.key))}
              >
                Start fresh run
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setRuns(endDeckRun(deck.key));
                  setShowAll(false);
                }}
              >
                End run · show full history
              </button>
            )}
            {confirmDelete ? (
              <span className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ background: "var(--color-poor)", color: "#1a0505" }}
                  onClick={() => {
                    setConfirmDelete(false);
                    setRuns(endDeckRun(deck.key));
                    void deleteMatches(deck.matches.map((m) => m.matchId));
                    onBack();
                  }}
                >
                  Really delete {deck.matches.length} match{deck.matches.length === 1 ? "" : "es"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setConfirmDelete(false)}
                >
                  Keep it
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setConfirmDelete(true)}
              >
                Delete deck history
              </button>
            )}
          </span>
        </div>
        {headerArts.length > 0 && (
          <div className="deck-detail-art">
            <CardArtStrip cards={headerArts} max={6} />
          </div>
        )}
        <div className="flex flex-wrap gap-2 mt-2">
          {metaHit ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => openDeck(metaHit.deckId)}
            >
              Open meta list
            </button>
          ) : (
            <span className="text-xs text-muted self-center">No matching meta list today</span>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => openClimbDeck(deck.key)}
          >
            Climb path
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            title="Grade this list against today's ranked peer field in Brew Lab"
            onClick={() => openBrewLabDeck(deck.key)}
          >
            Brew Lab clinic
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            title="Tag and note opponents in Matchup Lab"
            onClick={() => setPage("matchups")}
          >
            Opponents
          </button>
          <ShareDeckButton
            deckName={deck.name}
            deckList={deckList}
            matches={deck.matches}
            runStart={runStart}
          />
          {otherDecks.length > 0 && (
            <span className="flex items-center gap-1.5 text-xs compare-select-wrap">
              <label className="text-muted" htmlFor="stats-compare-deck">
                Compare
              </label>
              <select
                id="stats-compare-deck"
                className="fnd-select"
                value={compareKey}
                onChange={(e) => {
                  const v = e.target.value;
                  setCompareKey(v);
                  if (v) openStatsCompare(deck.key, v);
                }}
              >
                <option value="">Pick deck…</option>
                {otherDecks.map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.name}
                  </option>
                ))}
              </select>
            </span>
          )}
        </div>
        {runStart !== undefined && (
          <p className="run-banner">
            Fresh run since {new Date(runStart).toLocaleDateString()} — {hiddenByRun} earlier
            match{hiddenByRun === 1 ? "" : "es"} hidden.{" "}
            <button
              type="button"
              className="link-btn"
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll ? "Back to run view" : "Peek at full history"}
            </button>
          </p>
        )}
      </div>

      {visibleMatches.length === 0 ? (
        <div className="empty-state">
          <h2 className="text-lg font-semibold m-0 mb-2">Fresh run started</h2>
          <p className="text-sm text-muted max-w-md mx-auto leading-relaxed">
            The counter is at zero — your next match with {deck.name} starts the new record.
          </p>
        </div>
      ) : (
        <>
          <SummaryTiles matches={visibleMatches} />
          {deckList && (
            <TrackedDecklist
              deckName={deck.name}
              main={deckList.main}
              side={deckList.side}
            />
          )}
          <SplitsPanel matches={visibleMatches} showQueues showSeasons />
          <QueueAnalyticsPanel matches={visibleMatches} />
          <GameAnalyticsPanel deckMatches={visibleMatches} deckName={deck.name} />
          <VersionHistory deckMatches={deck.matches} />
          <MatchHistory
            matches={visibleMatches}
            onOpponent={(name) => openMatchupOpponent(name)}
            onDeck={(key) => {
              if (key !== deck.key) openStatsDeck(key);
            }}
          />
        </>
      )}
    </div>
  );
}
