import { useMemo } from "react";
import { winrateFavor } from "../../services/ranks";
import { currentStreak } from "../../services/climbStats";
import {
  isSameLocalDay,
  rollingWinrate,
  tallyMatches,
} from "../../services/statsHelpers";
import type { TrackedMatch } from "../../types/tracker";

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

/** Today's session, current streak, and the rolling winrate trend.
 *  Best/worst-10 stretches live in the insight chips above — not repeated here. */
export function FormTiles({ matches }: { matches: TrackedMatch[] }) {
  const today = useMemo(
    () => tallyMatches(matches.filter((m) => isSameLocalDay(m.endedAt))),
    [matches],
  );
  const streak = useMemo(() => currentStreak(matches), [matches]);

  if (today.decided === 0 && streak.type === null) return null;

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
    </div>
  );
}
