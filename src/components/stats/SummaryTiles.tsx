import { CountUp } from "../CountUp";
import { winrateFavor } from "../../services/ranks";
import { tallyMatches } from "../../services/statsHelpers";
import type { TrackedMatch } from "../../types/tracker";
import { RESULT_LABEL } from "./statsUi";

export function SummaryTiles({ matches }: { matches: TrackedMatch[] }) {
  const { wins, losses, rate } = tallyMatches(matches);
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
