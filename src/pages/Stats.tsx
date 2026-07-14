import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import {
  currentSeasonKey,
  deckKey,
  gameScore,
  queueLabel,
  seasonKeyOf,
  seasonLabel,
  timeAgo,
} from "../services/tracker";
import { endDeckRun, loadDeckRuns, startDeckRun, type DeckRuns } from "../services/deckRuns";
import { resolveArenaCardNames } from "../services/arenaCards";
import type { MatchResult, TrackedMatch } from "../types/tracker";

const RESULT_LABEL: Record<MatchResult, string> = {
  win: "Win",
  loss: "Loss",
  draw: "Draw",
  unknown: "?",
};

function winrateFavor(rate: number): "favored" | "even" | "unfavored" {
  if (rate >= 0.55) return "favored";
  if (rate >= 0.45) return "even";
  return "unfavored";
}

interface Tally {
  wins: number;
  losses: number;
  decided: number;
  rate: number | null;
}

function tally(matches: TrackedMatch[]): Tally {
  const wins = matches.filter((m) => m.result === "win").length;
  const losses = matches.filter((m) => m.result === "loss").length;
  const decided = wins + losses;
  return { wins, losses, decided, rate: decided > 0 ? wins / decided : null };
}

function StatusPanel() {
  const status = useAppStore((s) => s.trackerStatus);

  if (!status) {
    return (
      <div className="panel">
        <p className="eyebrow">Match tracking</p>
        <p className="text-sm text-muted m-0 leading-relaxed">
          The winrate tracker runs inside the desktop app. Launch Filthy Net Deck from your
          desktop to record MTG Arena matches.
        </p>
      </div>
    );
  }

  if (!status.logFound) {
    return (
      <div className="panel">
        <p className="eyebrow">Match tracking</p>
        <p className="text-sm m-0 mb-1">
          <span className="feed-dot offline" />
          Waiting for MTG Arena
        </p>
        <p className="text-sm text-muted m-0 leading-relaxed">
          No Arena log found yet. Start MTG Arena once and this page will come alive. Looking
          at: <span className="font-mono text-xs selectable">{status.logPath}</span>
        </p>
      </div>
    );
  }

  if (status.detailedLogs === false) {
    return (
      <div className="panel" style={{ borderColor: "color-mix(in srgb, var(--color-fair) 40%, transparent)" }}>
        <p className="eyebrow">One switch to flip in Arena</p>
        <p className="text-sm m-0 mb-1">
          <span className="feed-dot offline" />
          Detailed logs are disabled
        </p>
        <p className="text-sm text-muted m-0 leading-relaxed">
          Arena only writes match data when detailed logs are on. In MTG Arena open{" "}
          <strong className="text-foam">Options → Account</strong>, enable{" "}
          <strong className="text-foam">Detailed Logs (Plugin Support)</strong>, then restart
          Arena. Every tracker (Untapped, 17Lands…) uses this same official switch.
        </p>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm m-0">
          <span className="feed-dot live" />
          Tracking{status.localPlayer ? ` · ${status.localPlayer}` : ""}
          {status.detailedLogs === null && (
            <span className="text-muted"> — waiting for the first Arena event…</span>
          )}
        </p>
        <span className="text-xs text-muted">
          {status.matchesRecorded} match{status.matchesRecorded === 1 ? "" : "es"} recorded ·
          local only, nothing leaves this PC
        </span>
      </div>
      {status.parseErrors > 0 && (
        <p className="qa-flag mt-2 mb-0">
          {status.parseErrors} Arena event{status.parseErrors === 1 ? "" : "s"} could not be
          parsed — an Arena update may have changed the log format. Tracking may be incomplete
          until Filthy Net Deck updates.
        </p>
      )}
    </div>
  );
}

function SummaryTiles({ matches }: { matches: TrackedMatch[] }) {
  const { wins, losses, rate } = tally(matches);
  const last10 = matches.slice(0, 10);
  const latestRank = matches.find((m) => m.myRank)?.myRank;

  return (
    <div className="stat-tiles">
      <div className="panel stat-tile">
        <span className="stat-num">{matches.length}</span>
        <span className="stat-label">Matches</span>
      </div>
      <div className="panel stat-tile">
        <span className={`stat-num ${rate != null ? `favor-${winrateFavor(rate)}` : ""}`}>
          {rate != null ? `${(rate * 100).toFixed(1)}%` : "—"}
        </span>
        <span className="stat-label">
          Win rate · {wins}W {losses}L
        </span>
      </div>
      <div className="panel stat-tile">
        <span className="wl-dots">
          {last10.length === 0 && <span className="text-muted text-sm">—</span>}
          {last10.map((m) => (
            <span
              key={m.matchId}
              className={`wl-dot ${m.result}`}
              title={`${RESULT_LABEL[m.result]} vs ${m.opponentName ?? "?"}`}
            />
          ))}
        </span>
        <span className="stat-label">Last {Math.min(10, matches.length) || 10} · newest first</span>
      </div>
      <div className="panel stat-tile">
        <span className="stat-num text-gold-300">{latestRank ?? "—"}</span>
        <span className="stat-label">Rank at last match</span>
      </div>
    </div>
  );
}

/** One labelled winrate bar — shared by deck rows and the splits panel. */
function RateBar({ wins, losses }: { wins: number; losses: number }) {
  const decided = wins + losses;
  const rate = decided > 0 ? wins / decided : 0;
  return (
    <>
      <span className="mu-track">
        <span
          className={`mu-fill favor-${winrateFavor(rate)}`}
          style={{ width: `${Math.max(4, rate * 100)}%`, display: "block" }}
        />
      </span>
      <span className="deck-wr-score">
        {wins}W {losses}L
        <strong className={`favor-${winrateFavor(rate)}`}>
          {decided > 0 ? ` ${((rate) * 100).toFixed(0)}%` : " —"}
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
    let playW = 0, playL = 0, drawW = 0, drawL = 0;
    for (const m of matches) {
      for (const g of m.games) {
        if (g.onPlay === undefined || g.winningTeamId == null) continue;
        const won = g.winningTeamId === m.myTeamId;
        if (g.onPlay && won) playW++;
        else if (g.onPlay) playL++;
        else if (won) drawW++;
        else drawL++;
      }
    }
    if (playW + playL > 0) out.push({ label: "On the play · games", wins: playW, losses: playL });
    if (drawW + drawL > 0) out.push({ label: "On the draw · games", wins: drawW, losses: drawL });

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

interface DeckGroup {
  key: string;
  name: string;
  matches: TrackedMatch[];
  runActive: boolean;
}

/** Group matches by deck (newest deckName wins as the display name). */
function groupDecks(matches: TrackedMatch[], runs: DeckRuns): DeckGroup[] {
  const byKey = new Map<string, DeckGroup>();
  for (const m of matches) {
    const key = deckKey(m);
    let g = byKey.get(key);
    if (!g) {
      g = { key, name: "", matches: [], runActive: runs[key] !== undefined };
      byKey.set(key, g);
    }
    g.matches.push(m);
    // trackerMatches is newest-first, so keep the first name we see.
    if (!g.name && m.deckName) g.name = m.deckName;
  }
  for (const g of byKey.values()) {
    if (!g.name) g.name = "Unknown deck";
  }
  return [...byKey.values()].sort((a, b) => b.matches.length - a.matches.length);
}

function DeckBreakdown({
  decks,
  onSelect,
}: {
  decks: DeckGroup[];
  onSelect: (key: string) => void;
}) {
  if (decks.length === 0) return null;

  return (
    <div className="panel">
      <h3 className="dash-title">Your decks</h3>
      <div className="meta-bars">
        {decks.map((d) => {
          const t = tally(d.matches);
          return (
            <button
              key={d.key}
              type="button"
              className="meta-bar-row deck-wr-row deck-row-btn"
              onClick={() => onSelect(d.key)}
              title={`${d.name} — open deck stats`}
            >
              <span className="meta-bar-label">
                <span className="meta-bar-name">{d.name}</span>
                {d.runActive && <span className="run-badge">run</span>}
              </span>
              <RateBar wins={t.wins} losses={t.losses} />
              <span className="deck-row-chevron">›</span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted m-0 mt-2">Click a deck for its full breakdown.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deck detail: versions, diffs, fresh runs, delete
// ---------------------------------------------------------------------------

interface DeckVersion {
  hash: string;
  main?: number[];
  side?: number[];
  matches: TrackedMatch[];
  firstAt: number;
  lastAt: number;
}

/** Versions in order of first appearance; a version = a distinct card list. */
function buildVersions(deckMatches: TrackedMatch[]): DeckVersion[] {
  const asc = [...deckMatches].sort((a, b) => a.startedAt - b.startedAt);
  const byHash = new Map<string, DeckVersion>();
  for (const m of asc) {
    if (!m.deckHash) continue;
    let v = byHash.get(m.deckHash);
    if (!v) {
      v = { hash: m.deckHash, matches: [], firstAt: m.startedAt, lastAt: m.endedAt };
      byHash.set(m.deckHash, v);
    }
    v.matches.push(m);
    v.lastAt = Math.max(v.lastAt, m.endedAt);
    if (!v.main && m.deckMain) {
      v.main = m.deckMain;
      v.side = m.deckSide;
    }
  }
  return [...byHash.values()];
}

/** Multiset diff: positive delta = added in `next`, negative = cut. */
function diffLists(prev: number[], next: number[]): { id: number; delta: number }[] {
  const counts = new Map<number, number>();
  for (const id of next) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const id of prev) counts.set(id, (counts.get(id) ?? 0) - 1);
  return [...counts.entries()]
    .filter(([, delta]) => delta !== 0)
    .map(([id, delta]) => ({ id, delta }))
    .sort((a, b) => b.delta - a.delta || a.id - b.id);
}

function DiffChips({
  main,
  side,
  names,
}: {
  main: { id: number; delta: number }[];
  side: { id: number; delta: number }[];
  names: Record<number, string>;
}) {
  const chip = (d: { id: number; delta: number }, sb: boolean) => (
    <span key={`${sb ? "sb" : "mb"}-${d.id}`} className={`diff-chip ${d.delta > 0 ? "add" : "cut"}`}>
      {d.delta > 0 ? "+" : "−"}
      {Math.abs(d.delta)} {sb ? "SB " : ""}
      {names[d.id] ?? `#${d.id}`}
    </span>
  );
  return (
    <span className="diff-chips">
      {main.map((d) => chip(d, false))}
      {side.map((d) => chip(d, true))}
    </span>
  );
}

function VersionHistory({ deckMatches }: { deckMatches: TrackedMatch[] }) {
  const versions = useMemo(() => buildVersions(deckMatches), [deckMatches]);
  const [names, setNames] = useState<Record<number, string>>({});

  // Every card id that shows up in a diff needs a name.
  const diffIds = useMemo(() => {
    const ids = new Set<number>();
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

  useEffect(() => {
    if (diffIds.length === 0) return;
    let alive = true;
    void resolveArenaCardNames(diffIds).then((map) => {
      if (alive) setNames(map);
    });
    return () => {
      alive = false;
    };
  }, [diffIds]);

  if (versions.length === 0) return null;

  if (versions.length === 1) {
    return (
      <div className="panel">
        <h3 className="dash-title">Version history</h3>
        <p className="text-sm text-muted m-0 leading-relaxed">
          One build recorded so far. Change some cards in Arena and matches on the new list
          will show up here as a separate version — with the exact card diff and whether it
          plays better or worse.
        </p>
      </div>
    );
  }

  // Newest build first for display.
  const rows = versions
    .map((v, i) => ({ v, i }))
    .reverse();

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
              {i > 0 &&
                (mainDiff ? (
                  mainDiff.length + (sideDiff?.length ?? 0) > 0 ? (
                    <DiffChips main={mainDiff} side={sideDiff ?? []} names={names} />
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

function MatchRow({ m }: { m: TrackedMatch }) {
  const onPlay = m.games.length === 1 ? m.games[0]?.onPlay : undefined;
  return (
    <div className="match-row">
      <span className={`result-chip ${m.result}`}>{RESULT_LABEL[m.result]}</span>
      <span className="match-opponent" title={m.opponentPlatform ?? undefined}>
        vs {m.opponentName ?? "Unknown"}
      </span>
      <span className="match-detail">
        {m.deckName ?? "Unknown deck"}
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

function MatchHistory({ matches }: { matches: TrackedMatch[] }) {
  const [visible, setVisible] = useState(30);
  return (
    <div className="panel">
      <h3 className="dash-title">Match history</h3>
      <div className="match-rows">
        {matches.slice(0, visible).map((m) => (
          <MatchRow key={m.matchId} m={m} />
        ))}
      </div>
      {matches.length > visible && (
        <button
          type="button"
          className="btn btn-ghost btn-sm mt-3"
          onClick={() => setVisible((v) => v + 50)}
        >
          Show more ({matches.length - visible} older)
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
}: {
  deck: DeckGroup;
  runs: DeckRuns;
  setRuns: (r: DeckRuns) => void;
  onBack: () => void;
}) {
  const deleteMatches = useAppStore((s) => s.deleteMatches);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const runStart = runs[deck.key];
  const hiddenByRun =
    runStart !== undefined ? deck.matches.filter((m) => m.endedAt < runStart).length : 0;
  const visibleMatches =
    runStart !== undefined && !showAll
      ? deck.matches.filter((m) => m.endedAt >= runStart)
      : deck.matches;

  return (
    <div className="flex flex-col gap-3">
      <div className="panel">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="flex items-center gap-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
              ‹ All decks
            </button>
            <h3 className="dash-title m-0">{deck.name}</h3>
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
          <SplitsPanel matches={visibleMatches} showQueues showSeasons />
          <VersionHistory deckMatches={deck.matches} />
          <MatchHistory matches={visibleMatches} />
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
  const [queue, setQueue] = useState<string | null>(null);
  const [seasonSel, setSeasonSel] = useState<string | null>(null); // null = auto
  const [selectedDeck, setSelectedDeck] = useState<string | null>(null);
  const [runs, setRuns] = useState<DeckRuns>(() => loadDeckRuns());
  const [confirmClear, setConfirmClear] = useState(false);

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

  if (selected) {
    return (
      <DeckDetail
        deck={selected}
        runs={runs}
        setRuns={setRuns}
        onBack={() => setSelectedDeck(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <StatusPanel />

      {matches.length === 0 ? (
        status?.logFound && status.detailedLogs !== false ? (
          <div className="empty-state">
            <h2 className="text-lg font-semibold m-0 mb-2">No matches recorded yet</h2>
            <p className="text-sm text-muted max-w-md mx-auto leading-relaxed">
              Keep Filthy Net Deck running while you play MTG Arena — every match lands here
              automatically the moment it ends. Win rates by deck, opponents, play/draw, rank.
            </p>
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

          <SummaryTiles matches={filtered} />
          <SplitsPanel matches={filtered} />
          <DeckBreakdown decks={decks} onSelect={setSelectedDeck} />
          <MatchHistory matches={filtered} />

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
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setConfirmClear(true)}
              >
                Clear history
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
