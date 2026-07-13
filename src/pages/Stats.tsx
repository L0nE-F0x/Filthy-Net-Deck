import { useMemo, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { gameScore, queueLabel, timeAgo } from "../services/tracker";
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
  const wins = matches.filter((m) => m.result === "win").length;
  const losses = matches.filter((m) => m.result === "loss").length;
  const decided = wins + losses;
  const rate = decided > 0 ? wins / decided : null;
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

function DeckBreakdown({ matches }: { matches: TrackedMatch[] }) {
  const rows = useMemo(() => {
    const byDeck = new Map<string, { name: string; wins: number; losses: number; total: number }>();
    for (const m of matches) {
      const name = m.deckName ?? "Unknown deck";
      const key = m.deckName ?? m.deckHash ?? "unknown";
      const row = byDeck.get(key) ?? { name, wins: 0, losses: 0, total: 0 };
      row.total += 1;
      if (m.result === "win") row.wins += 1;
      if (m.result === "loss") row.losses += 1;
      byDeck.set(key, row);
    }
    return [...byDeck.values()].sort((a, b) => b.total - a.total);
  }, [matches]);

  if (rows.length === 0) return null;

  return (
    <div className="panel">
      <h3 className="dash-title">Your decks</h3>
      <div className="meta-bars">
        {rows.map((d) => {
          const decided = d.wins + d.losses;
          const rate = decided > 0 ? d.wins / decided : 0;
          return (
            <div key={d.name} className="meta-bar-row deck-wr-row">
              <span className="meta-bar-label">
                <span className="meta-bar-name" title={d.name}>
                  {d.name}
                </span>
              </span>
              <span className="mu-track">
                <span
                  className={`mu-fill favor-${winrateFavor(rate)}`}
                  style={{ width: `${Math.max(4, rate * 100)}%`, display: "block" }}
                />
              </span>
              <span className="deck-wr-score">
                {d.wins}W {d.losses}L
                <strong className={`favor-${winrateFavor(rate)}`}>
                  {decided > 0 ? ` ${(rate * 100).toFixed(0)}%` : " —"}
                </strong>
              </span>
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

export function Stats() {
  const matches = useAppStore((s) => s.trackerMatches);
  const status = useAppStore((s) => s.trackerStatus);
  const clearTracker = useAppStore((s) => s.clearTracker);
  const [queue, setQueue] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [visible, setVisible] = useState(30);

  const queues = useMemo(() => {
    const ids = new Set(matches.map((m) => m.eventId));
    return [...ids].sort();
  }, [matches]);

  const filtered = useMemo(
    () => (queue ? matches.filter((m) => m.eventId === queue) : matches),
    [matches, queue],
  );

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
          <DeckBreakdown matches={filtered} />

          <div className="panel">
            <h3 className="dash-title">Match history</h3>
            <div className="match-rows">
              {filtered.slice(0, visible).map((m) => (
                <MatchRow key={m.matchId} m={m} />
              ))}
            </div>
            {filtered.length > visible && (
              <button
                type="button"
                className="btn btn-ghost btn-sm mt-3"
                onClick={() => setVisible((v) => v + 50)}
              >
                Show more ({filtered.length - visible} older)
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs text-muted m-0">
              Matches are read from Arena's own log and stored only on this PC.
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
