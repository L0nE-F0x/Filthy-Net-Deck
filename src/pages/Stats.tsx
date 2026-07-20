import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import {
  currentSeasonKey,
  deckKey,
  exportTrackerCsv,
  gameScore,
  queueLabel,
  seasonKeyOf,
  seasonLabel,
  timeAgo,
} from "../services/tracker";
import { recapFromMatches, renderRecapPng } from "../services/recapCard";
import {
  dayWindow,
  formatRecapHeadline,
  lastSevenDaysWindow,
  sessionWindow,
} from "../services/recapStats";
import { aggregateDeck, downloadDeckSharePng } from "../services/deckShare";
import {
  communityShareOptions,
  deliverShare,
  recapCaption,
  type ShareDestination,
} from "../services/communityShare";
import { endDeckRun, loadDeckRuns, startDeckRun, type DeckRuns } from "../services/deckRuns";
import { isLandName } from "../services/landNames";
import { formatRank, parseRank, winrateFavor } from "../services/ranks";
import { currentStreak } from "../services/climbStats";
import {
  resolveArenaCards,
  type ArenaCardInfo,
} from "../services/arenaCards";
import {
  buildInsightChips,
  buildSeasonStory,
  compareDecks,
} from "../services/statsInsights";
import { resolveMetaDeck } from "../services/deepLinks";
import { CardArt, CardArtStrip, type ArtRef } from "../components/CardArt";
import { TrackedDecklist } from "../components/TrackedDecklist";
import { GameAnalyticsPanel } from "../components/GameAnalyticsPanel";
import { gamePlayDrawSplit, mulliganStats } from "../services/gameAnalytics";
import { TrackerOnboarding } from "../components/TrackerOnboarding";
import { CountUp } from "../components/CountUp";
import { ShareMenu } from "../components/ShareMenu";
import { BrewLabPanel } from "../components/BrewLabPanel";
import { diagnoseTrackerHealth } from "../services/trackerHealth";
import type { MatchResult, TrackedMatch } from "../types/tracker";
import { inferOpponentArchetype } from "../services/opponentArchetype";
import { peekArenaMeta, resolveArenaMetaBatch } from "../services/arenaMeta";
import { decksForMode } from "../services/deckHelpers";
import {
  formExtremes,
  isSameLocalDay,
  rollingWinrate,
  tallyMatches,
} from "../services/statsHelpers";
import {
  DECK_SORT_DEFAULTS,
  groupDecks,
  sortDecks,
  type DeckGroup,
  type DeckSortKey,
} from "../services/deckStats";
import {
  MATCH_SORT_DEFAULTS,
  sortMatches,
  type MatchSortKey,
} from "../services/matchHistorySort";
import { QueueAnalyticsPanel } from "../components/QueueAnalyticsPanel";
import {
  buildVersions,
  diffLists,
  latestDecklist,
  latestMainboard,
} from "../services/deckVersions";

function pickArenaPreview(
  main: number[] | undefined,
  cards: Record<number, ArenaCardInfo>,
  max = 4,
): ArtRef[] {
  if (!main?.length) return [];
  const counts = new Map<number, number>();
  for (const id of main) counts.set(id, (counts.get(id) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const spells: ArtRef[] = [];
  const lands: ArtRef[] = [];
  for (const [id] of ranked) {
    const info = cards[id];
    if (!info?.name) continue;
    const ref: ArtRef = { name: info.name, scryfallId: info.scryfallId };
    if (isLandName(info.name)) lands.push(ref);
    else spells.push(ref);
  }
  return [...spells, ...lands].slice(0, max);
}

function useArenaCardMap(ids: number[]): Record<number, ArenaCardInfo> {
  const [cards, setCards] = useState<Record<number, ArenaCardInfo>>({});
  const key = ids.slice().sort((a, b) => a - b).join(",");
  useEffect(() => {
    if (ids.length === 0) {
      setCards({});
      return;
    }
    let alive = true;
    void resolveArenaCards(ids).then((map) => {
      if (alive) setCards(map);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return cards;
}

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

const RESULT_LABEL: Record<MatchResult, string> = {
  win: "Win",
  loss: "Loss",
  draw: "Draw",
  unknown: "?",
};

type SortDir = "asc" | "desc";

/** Click a column header: same key flips direction; new key uses its default. */
function nextSort<K extends string>(
  key: K,
  current: { key: K; dir: SortDir },
  defaults: Record<K, SortDir>,
): { key: K; dir: SortDir } {
  if (current.key === key) {
    return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  }
  return { key, dir: defaults[key] };
}

function SortHeaderBtn({
  label,
  active,
  dir,
  align = "left",
  onClick,
  className = "",
  tip,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  align?: "left" | "right" | "center";
  onClick: () => void;
  className?: string;
  /** Longer hover help (defaults to sort-by label). */
  tip?: string;
}) {
  const marker = active ? (dir === "asc" ? "▲" : "▼") : "";
  const sortState = active
    ? dir === "asc"
      ? "ascending — click to reverse"
      : "descending — click to reverse"
    : "click to sort";
  return (
    <button
      type="button"
      className={`sort-head-btn align-${align}${active ? " active" : ""}${className ? ` ${className}` : ""}`}
      onClick={onClick}
      title={tip ? `${tip} (${sortState})` : `Sort by ${label} (${sortState})`}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      {label}
      <span className={`sort-marker${active ? " on" : ""}`} aria-hidden="true">
        {marker}
      </span>
    </button>
  );
}

type Tally = ReturnType<typeof tallyMatches>;

function tally(matches: TrackedMatch[]): Tally {
  return tallyMatches(matches);
}

function StatusPanel() {
  const status = useAppStore((s) => s.trackerStatus);
  const matches = useAppStore((s) => s.trackerMatches);
  const health = diagnoseTrackerHealth(status, matches.length);

  if (
    health.phase === "browser" ||
    health.phase === "no_log" ||
    health.phase === "detailed_off" ||
    health.phase === "waiting_first" ||
    health.phase === "parse_stress"
  ) {
    return (
      <div
        className="panel"
        style={
          health.phase === "detailed_off" || health.phase === "parse_stress"
            ? {
                borderColor:
                  "color-mix(in srgb, var(--color-fair) 40%, transparent)",
              }
            : undefined
        }
      >
        <p className="eyebrow">Match tracking</p>
        <TrackerOnboarding />
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm m-0">
          <span className="feed-dot live" />
          {health.headline}
          {status?.detailedLogs === null && (
            <span className="text-muted"> — waiting for the first Arena event…</span>
          )}
        </p>
        <span className="text-xs text-muted">
          {status?.matchesRecorded ?? 0} match
          {(status?.matchesRecorded ?? 0) === 1 ? "" : "es"} recorded · local only
        </span>
      </div>
      <p className="text-xs text-muted m-0 mt-1 leading-relaxed">{health.detail}</p>
      {status && status.parseErrors > 0 && status.parseErrors < 3 && (
        <p className="qa-flag mt-2 mb-0">
          {status.parseErrors} minor parse skip{status.parseErrors === 1 ? "" : "s"} — usually
          noise; watch this if it climbs after an Arena patch.
        </p>
      )}
    </div>
  );
}

function isToday(ms: number): boolean {
  return isSameLocalDay(ms);
}

function TrendSparkline({ matches }: { matches: TrackedMatch[] }) {
  const points = useMemo(() => rollingWinrate(matches), [matches]);
  if (points.length < 5) return null;
  const w = 220;
  const h = 44;
  const pad = 3;
  const step = (w - pad * 2) / Math.max(1, points.length - 1);
  const line = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${(pad + i * step).toFixed(1)} ${(pad + (1 - p) * (h - pad * 2)).toFixed(1)}`,
    )
    .join(" ");
  const last = points[points.length - 1];
  const midY = pad + 0.5 * (h - pad * 2);
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="wr-spark"
      role="img"
      aria-label={`Rolling win rate, currently ${(last * 100).toFixed(0)}%`}
    >
      <line x1={pad} x2={w - pad} y1={midY} y2={midY} className="wr-spark-mid" />
      <path d={line} className={`wr-spark-line favor-${winrateFavor(last)}`} fill="none" />
    </svg>
  );
}

/** Today's session, current streak, and the rolling winrate trend. */
function FormTiles({ matches }: { matches: TrackedMatch[] }) {
  const today = useMemo(() => tally(matches.filter((m) => isToday(m.endedAt))), [matches]);
  const streak = useMemo(() => currentStreak(matches), [matches]);
  const { best: formHi, worst: formLo } = useMemo(
    () => formExtremes(matches, 10),
    [matches],
  );

  if (today.decided === 0 && streak.type === null && !formHi) return null;

  return (
    <div className="stat-tiles stat-tiles-3">
      <div
        className="panel stat-tile"
        title={
          today.decided > 0
            ? `Today: ${today.wins}W–${today.losses}L${today.rate != null ? ` · ${Math.round(today.rate * 100)}%` : ""}`
            : "No decided games today yet"
        }
      >
        <span
          className={`stat-num ${today.rate != null ? `favor-${winrateFavor(today.rate)}` : ""}`}
        >
          {today.decided > 0 ? `${today.wins}W ${today.losses}L` : "—"}
        </span>
        <span className="stat-label">
          Today{today.rate != null ? ` · ${(today.rate * 100).toFixed(0)}%` : " · no games yet"}
        </span>
      </div>
      <div
        className="panel stat-tile"
        title={
          streak.type
            ? `Current ${streak.type} streak of ${streak.length} (most recent match first)`
            : "No active win/loss streak"
        }
      >
        <span
          className={`stat-num ${streak.type ? (streak.type === "win" ? "favor-favored" : "favor-unfavored") : ""}`}
        >
          {streak.type ? `${streak.type === "win" ? "W" : "L"}${streak.length}` : "—"}
        </span>
        <span className="stat-label">
          {streak.type
            ? streak.type === "win"
              ? "Win streak — keep it rolling"
              : "Loss streak — shake it off"
            : "Streak"}
        </span>
      </div>
      <div
        className="panel stat-tile stat-tile-spark"
        title="Rolling win rate over your last 10 decided games"
      >
        <TrendSparkline matches={matches} />
        <span className="stat-label">Win rate trend · rolling 10</span>
      </div>
      {formHi ? (
        <div
          className="panel stat-tile"
          title={`Best 10-match stretch: ${formHi.wins}W–${formHi.losses}L (${Math.round(formHi.rate * 100)}%)`}
        >
          <span className={`stat-num favor-${winrateFavor(formHi.rate)}`}>
            {Math.round(formHi.rate * 100)}%
          </span>
          <span className="stat-label">
            Best 10 · {formHi.wins}W–{formHi.losses}L
            {formLo ? ` · worst ${Math.round(formLo.rate * 100)}%` : ""}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function SummaryTiles({ matches }: { matches: TrackedMatch[] }) {
  const { wins, losses, rate } = tally(matches);
  const last10 = matches.slice(0, 10);
  const latestRank = matches.find((m) => m.myRank)?.myRank;

  return (
    <div className="stat-tiles">
      <div
        className="panel stat-tile"
        title={`${matches.length} matches in the current season / queue filter`}
      >
        <CountUp className="stat-num" value={matches.length} />
        <span className="stat-label">Matches</span>
      </div>
      <div
        className="panel stat-tile"
        title={
          rate != null
            ? `${wins}W–${losses}L · ${(rate * 100).toFixed(1)}% of decided games`
            : "No decided wins/losses yet"
        }
      >
        {rate != null ? (
          <CountUp
            className={`stat-num favor-${winrateFavor(rate)}`}
            value={rate * 100}
            decimals={1}
            suffix="%"
          />
        ) : (
          <span className="stat-num">—</span>
        )}
        <span className="stat-label">
          Win rate · {wins}W {losses}L
        </span>
      </div>
      <div
        className="panel stat-tile"
        title="Most recent results left-to-right (newest first). Hover a dot for opponent."
      >
        <span className="wl-dots">
          {last10.length === 0 && <span className="text-muted text-sm">—</span>}
          {last10.map((m) => (
            <span
              key={m.matchId}
              className={`wl-dot ${m.result}`}
              title={`${RESULT_LABEL[m.result]} vs ${m.opponentName ?? "?"} · ${new Date(m.endedAt).toLocaleString()}${m.deckName ? ` · ${m.deckName}` : ""}`}
            />
          ))}
        </span>
        <span className="stat-label">Last {Math.min(10, matches.length) || 10} · newest first</span>
      </div>
      <div
        className="panel stat-tile"
        title={
          latestRank
            ? `Constructed rank stamp from your latest ranked match: ${latestRank}`
            : "No rank stamp on recent matches yet"
        }
      >
        <span className="stat-num text-gold-300">{latestRank ?? "—"}</span>
        <span className="stat-label">Rank at last match</span>
      </div>
    </div>
  );
}

/** One labelled winrate bar — shared by deck rows and the splits panel. */
function RateBar({
  wins,
  losses,
  tip,
}: {
  wins: number;
  losses: number;
  tip?: string;
}) {
  const decided = wins + losses;
  const rate = decided > 0 ? wins / decided : 0;
  const defaultTip =
    decided > 0
      ? `${wins}W–${losses}L · ${Math.round(rate * 100)}% of decided games`
      : "No decided games yet";
  return (
    <>
      <span className="mu-track" title={tip ?? defaultTip}>
        <span
          className={`mu-fill favor-${winrateFavor(rate)}`}
          style={{ width: `${Math.max(4, rate * 100)}%`, display: "block" }}
        />
      </span>
      <span className="deck-wr-score" title={tip ?? defaultTip}>
        {wins}W {losses}L
        <strong className={`favor-${winrateFavor(rate)}`}>
          {decided > 0 ? ` ${(rate * 100).toFixed(0)}%` : " —"}
        </strong>
      </span>
    </>
  );
}

/**
 * Finer-grained win rates: play vs draw (per game), Bo1 vs Bo3, and
 * optionally per queue and per season.
 */
function SplitsPanel({
  matches,
  showQueues,
  showSeasons,
}: {
  matches: TrackedMatch[];
  showQueues?: boolean;
  showSeasons?: boolean;
}) {
  const rows = useMemo(() => {
    const out: { label: string; wins: number; losses: number }[] = [];

    // Per-game play/draw split — the classic "am I too draw-dependent" check.
    const pd = gamePlayDrawSplit(matches);
    if (pd.play.games > 0)
      out.push({ label: "On the play · games", wins: pd.play.wins, losses: pd.play.games - pd.play.wins });
    if (pd.draw.games > 0)
      out.push({ label: "On the draw · games", wins: pd.draw.wins, losses: pd.draw.games - pd.draw.wins });

    // B2 — keep-7 vs mulled (only when the tracker stamped mulligans).
    const ms = mulliganStats(matches);
    for (const b of ms.buckets) {
      if (b.games < 3) continue;
      out.push({
        label: b.mulls === 0 ? "Kept 7 · games" : `Mulled −${b.mulls} · games`,
        wins: b.wins,
        losses: b.games - b.wins,
      });
    }

    const bo1 = tally(matches.filter((m) => m.bestOf === 1));
    const bo3 = tally(matches.filter((m) => m.bestOf === 3));
    if (bo1.decided > 0 && bo3.decided > 0) {
      out.push({ label: "Best of one", wins: bo1.wins, losses: bo1.losses });
      out.push({ label: "Best of three", wins: bo3.wins, losses: bo3.losses });
    }

    if (showQueues) {
      const queues = [...new Set(matches.map((m) => m.eventId))];
      if (queues.length > 1) {
        for (const q of queues.sort()) {
          const t = tally(matches.filter((m) => m.eventId === q));
          if (t.decided > 0) out.push({ label: queueLabel(q), wins: t.wins, losses: t.losses });
        }
      }
    }

    if (showSeasons) {
      const seasons = [...new Set(matches.map((m) => seasonKeyOf(m.endedAt)))]
        .sort()
        .reverse()
        .slice(0, 6);
      if (seasons.length > 1) {
        for (const s of seasons) {
          const t = tally(matches.filter((m) => seasonKeyOf(m.endedAt) === s));
          if (t.decided > 0) out.push({ label: seasonLabel(s), wins: t.wins, losses: t.losses });
        }
      }
    }

    return out;
  }, [matches, showQueues, showSeasons]);

  if (rows.length === 0) return null;

  return (
    <div className="panel">
      <h3 className="dash-title">Win rate breakdown</h3>
      <div className="meta-bars">
        {rows.map((r) => (
          <div key={r.label} className="meta-bar-row deck-wr-row">
            <span className="meta-bar-label">
              <span className="meta-bar-name" title={r.label}>
                {r.label}
              </span>
            </span>
            <RateBar wins={r.wins} losses={r.losses} />
          </div>
        ))}
      </div>
    </div>
  );
}

function DeckBreakdown({
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
          const t = tally(d.matches);
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

/** Hero fan of cards from your most-played decks — livens up the Stats home. */
function StatsArsenal({
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

// ---------------------------------------------------------------------------
// Deck detail: versions, diffs, fresh runs, delete
// ---------------------------------------------------------------------------

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
          const t = tally(v.matches);
          const prev = i > 0 ? versions[i - 1] : null;
          const prevTally = prev ? tally(prev.matches) : null;
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

function MatchRow({
  m,
  onOpponent,
  onDeck,
  oppArch,
}: {
  m: TrackedMatch;
  onOpponent: (name: string) => void;
  onDeck: (key: string) => void;
  oppArch?: string | null;
}) {
  const onPlay = m.games.length === 1 ? m.games[0]?.onPlay : undefined;
  return (
    <div className="match-row">
      <span className={`result-chip ${m.result}`}>{RESULT_LABEL[m.result]}</span>
      <button
        type="button"
        className="match-opponent link-btn text-left"
        title={m.opponentPlatform ?? "Open in Matchup Lab"}
        onClick={() => onOpponent(m.opponentName ?? "Unknown")}
      >
        vs {m.opponentName ?? "Unknown"}
        {oppArch ? (
          <span className="text-muted font-normal"> · {oppArch}</span>
        ) : null}
      </button>
      <span className="match-detail">
        <button
          type="button"
          className="link-btn"
          onClick={() => onDeck(deckKey(m))}
        >
          {m.deckName ?? "Unknown deck"}
        </button>
        <span className="text-muted"> · {queueLabel(m.eventId)}</span>
        {m.games.length > 1 && <span className="text-muted"> · {gameScore(m)}</span>}
        {onPlay !== undefined && (
          <span className="text-muted"> · {onPlay ? "on the play" : "on the draw"}</span>
        )}
      </span>
      <span className="match-when" title={new Date(m.endedAt).toLocaleString()}>
        {m.myRank && <span className="text-muted">{m.myRank} · </span>}
        {timeAgo(m.endedAt)}
      </span>
    </div>
  );
}

function MatchHistory({
  matches,
  onOpponent,
  onDeck,
}: {
  matches: TrackedMatch[];
  onOpponent: (name: string) => void;
  onDeck: (key: string) => void;
}) {
  const meta = useAppStore((s) => s.meta);
  const mode = useAppStore((s) => s.mode);
  const dailyFormatId = useAppStore((s) => s.dailyFormatId);
  const [visible, setVisible] = useState(30);
  const [sort, setSort] = useState<{ key: MatchSortKey; dir: SortDir }>({
    key: "when",
    dir: "desc",
  });
  const [namesTick, setNamesTick] = useState(0);

  const candidates = useMemo(() => {
    if (!meta) return [];
    const fmt =
      meta.formats.find((f) => f.id === dailyFormatId) ??
      meta.formats.find((f) => f.featured) ??
      meta.formats[0];
    if (!fmt) return [];
    return decksForMode(fmt, mode, meta.decks);
  }, [meta, mode, dailyFormatId]);

  useEffect(() => {
    const ids = new Set<number>();
    for (const m of matches) {
      for (const id of m.opponentSeen ?? []) ids.add(id);
    }
    if (ids.size === 0) return;
    let cancelled = false;
    void resolveArenaMetaBatch([...ids]).then(() => {
      if (!cancelled) setNamesTick((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [matches]);

  const archByMatch = useMemo(() => {
    void namesTick;
    const map = new Map<string, string>();
    if (!candidates.length) return map;
    const resolve = (id: number) => peekArenaMeta(id)?.name ?? null;
    for (const m of matches) {
      if (!m.opponentSeen?.length) continue;
      const g = inferOpponentArchetype(m.opponentSeen, resolve, candidates, {
        minHits: 2,
        minConfidence: 0.3,
      });
      if (g) map.set(m.matchId, g.archetype);
    }
    return map;
  }, [matches, candidates, namesTick]);

  const sorted = useMemo(
    () => sortMatches(matches, sort.key, sort.dir),
    [matches, sort.key, sort.dir],
  );

  const setCol = (key: MatchSortKey) =>
    setSort((cur) => nextSort(key, cur, MATCH_SORT_DEFAULTS));

  return (
    <div className="panel">
      <h3 className="dash-title">Match history</h3>
      <div className="match-rows">
        <div className="match-row match-sort-head" role="row">
          <SortHeaderBtn
            label="Result"
            active={sort.key === "result"}
            dir={sort.dir}
            onClick={() => setCol("result")}
          />
          <SortHeaderBtn
            label="Opponent"
            active={sort.key === "opponent"}
            dir={sort.dir}
            onClick={() => setCol("opponent")}
          />
          <SortHeaderBtn
            label="Deck"
            active={sort.key === "deck"}
            dir={sort.dir}
            onClick={() => setCol("deck")}
          />
          <SortHeaderBtn
            label="When"
            active={sort.key === "when"}
            dir={sort.dir}
            align="right"
            onClick={() => setCol("when")}
          />
        </div>
        {sorted.slice(0, visible).map((m) => (
          <MatchRow
            key={m.matchId}
            m={m}
            onOpponent={onOpponent}
            onDeck={onDeck}
            oppArch={archByMatch.get(m.matchId)}
          />
        ))}
      </div>
      {sorted.length > visible && (
        <button
          type="button"
          className="btn btn-ghost btn-sm mt-3"
          onClick={() => setVisible((v) => v + 50)}
        >
          Show more ({sorted.length - visible} older)
        </button>
      )}
    </div>
  );
}

function DeckDetail({
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
          <BrewLabPanel
            deckName={deck.name}
            mainIds={deckList?.main}
            sideIds={deckList?.side}
          />
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
          <div className="panel share-row">
            <div>
              <p className="eyebrow m-0 mb-0.5">Share after a session</p>
              <p className="text-xs text-muted m-0">
                Week recap — save PNG, paste into Discord, or post on X with a
                download link. Every share is free marketing.
              </p>
              {recapMsg && <p className="text-xs m-0 mt-1 text-foam">{recapMsg}</p>}
            </div>
            <ShareMenu
              label="Share week recap"
              hint="WR, rank move, best deck — branded card"
              variant="primary"
              options={communityShareOptions("local week only")}
              onPick={async (id) => {
                const dest = id as ShareDestination;
                const stats = recapFromMatches(matches);
                setRecapMsg(`${formatRecapHeadline(stats)} — rendering…`);
                try {
                  const blob = await renderRecapPng(stats);
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
