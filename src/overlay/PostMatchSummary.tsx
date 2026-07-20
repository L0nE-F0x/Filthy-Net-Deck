/**
 * Post-match summary card — shown in the overlay while the "ended" live
 * frame lingers (see tracker.rs `schedule_clear_ended`). The bar already
 * carries the result pill + opponent; this adds the progression story:
 * season/session chips, recent form, and the rank-path sparkline.
 */
import { memo, useMemo } from "react";
import type { LiveMatch, TrackedMatch } from "../types/tracker";
import { deckKey } from "../services/tracker";
import { buildRankSeries, rankLabelFromScore } from "../services/ranks";
import { sessionWindow } from "../services/recapStats";

/** Sparkline geometry (viewBox units; the SVG scales with panel width). */
const SPARK_W = 180;
const SPARK_H = 46;
const SPARK_PAD = 6;
/** Points on the progression graph. */
const SPARK_POINTS = 12;
/** Recent-form squares. */
const FORM_GAMES = 8;

interface Props {
  live: LiveMatch;
  matches: TrackedMatch[];
  /** Season record on this deck (computed by the parent). */
  record: { wins: number; losses: number; wr: number | null };
  /** Live-inferred opponent archetype, when known. */
  oppGuess: string | null;
}

interface Spark {
  /** Y values in arbitrary units — normalized at render time. */
  values: number[];
  /** Per-point result for the dot color. */
  results: (string | undefined)[];
  firstLabel: string;
  lastLabel: string;
  /** "rank" = ladder path, "wr" = running winrate trend. */
  kind: "rank" | "wr";
}

export const PostMatchSummary = memo(function PostMatchSummary({
  live,
  matches,
  record,
  oppGuess,
}: Props) {
  /** Decided matches on this deck, chronological. */
  const deckMatches = useMemo(() => {
    const key = live.deckId ?? live.deckName ?? live.deckHash ?? null;
    return matches
      .filter((m) => {
        if (m.result !== "win" && m.result !== "loss") return false;
        if (!key) return true;
        return (
          deckKey(m) === key || (!!live.deckHash && m.deckHash === live.deckHash)
        );
      })
      .sort((a, b) => a.endedAt - b.endedAt);
  }, [matches, live]);

  /** Record within the current play session (same deck). */
  const session = useMemo(() => {
    const { fromMs } = sessionWindow(matches);
    let wins = 0;
    let losses = 0;
    for (const m of deckMatches) {
      if (m.endedAt < fromMs) continue;
      if (m.result === "win") wins++;
      else losses++;
    }
    return wins + losses > 0 ? { wins, losses } : null;
  }, [matches, deckMatches]);

  const form = useMemo(() => deckMatches.slice(-FORM_GAMES), [deckMatches]);

  const spark = useMemo<Spark | null>(() => {
    // Preferred: the ladder rank path (player-wide, not deck-scoped).
    const series = buildRankSeries(matches).slice(-SPARK_POINTS);
    if (series.length >= 2) {
      return {
        kind: "rank",
        values: series.map((p) => p.rank.score),
        results: series.map((p) => p.result),
        firstLabel: rankLabelFromScore(series[0].rank.score),
        lastLabel:
          live.myRank ??
          rankLabelFromScore(series[series.length - 1].rank.score),
      };
    }
    // Fallback: running winrate trend on this deck.
    const recent = deckMatches.slice(-SPARK_POINTS);
    if (recent.length >= 2) {
      let wins = 0;
      const values = recent.map((m, i) => {
        if (m.result === "win") wins++;
        return (wins / (i + 1)) * 100;
      });
      return {
        kind: "wr",
        values,
        results: recent.map((m) => m.result),
        firstLabel: `${Math.round(values[0])}%`,
        lastLabel: `${Math.round(values[values.length - 1])}% WR`,
      };
    }
    return null;
  }, [matches, deckMatches, live.myRank]);

  const sparkGeom = useMemo(() => {
    if (!spark) return null;
    const n = spark.values.length;
    let min = Math.min(...spark.values);
    let max = Math.max(...spark.values);
    if (max - min < 0.5) {
      const mid = (max + min) / 2;
      min = mid - 0.25;
      max = mid + 0.25;
    }
    const iw = SPARK_W - SPARK_PAD * 2;
    const ih = SPARK_H - SPARK_PAD * 2;
    const pts = spark.values.map((v, i) => {
      const x = SPARK_PAD + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
      const y = SPARK_PAD + (1 - (v - min) / (max - min)) * ih;
      return [x, y] as const;
    });
    const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    return { pts, line };
  }, [spark]);

  const formWins = form.filter((m) => m.result === "win").length;

  return (
    <div className="postmatch" data-tauri-drag-region>
      <div className="postmatch-chips" data-tauri-drag-region>
        {record.wr != null && (
          <span
            className="postmatch-chip"
            title={`This season on this deck: ${record.wins}–${record.losses} · ${record.wr}%`}
          >
            Season {record.wins}–{record.losses} · {record.wr}%
          </span>
        )}
        {session && (
          <span
            className="postmatch-chip"
            title="Current play session (gaps under 3h)"
          >
            Session {session.wins}–{session.losses}
          </span>
        )}
        {oppGuess && (
          <span
            className="postmatch-chip postmatch-chip--arch"
            title="Opponent deck inferred from cards seen"
          >
            vs {oppGuess}
          </span>
        )}
      </div>

      {form.length > 0 && (
        <div
          className="postmatch-form"
          title={`Last ${form.length} on this deck: ${formWins}W ${form.length - formWins}L`}
        >
          {form.map((m) => (
            <span key={m.matchId} className={`postmatch-dot is-${m.result}`} />
          ))}
          <em>
            {formWins}W {form.length - formWins}L
          </em>
        </div>
      )}

      {spark && sparkGeom && (
        <div className="postmatch-graph">
          <svg
            viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
            className="postmatch-spark"
            role="img"
            aria-label={
              spark.kind === "rank" ? "Rank path" : "Winrate trend"
            }
          >
            <polyline className="postmatch-spark-line" points={sparkGeom.line} />
            {sparkGeom.pts.map(([x, y], i) => {
              const r = spark.results[i];
              const last = i === sparkGeom.pts.length - 1;
              return (
                <circle
                  key={i}
                  className={`postmatch-spark-dot${last ? " is-last" : ""} is-${
                    r === "win" || r === "loss" ? r : "other"
                  }`}
                  cx={x}
                  cy={y}
                  r={last ? 2.6 : 1.5}
                />
              );
            })}
          </svg>
          <div className="postmatch-graph-labels">
            <span>{spark.firstLabel}</span>
            <span className="postmatch-graph-kind">
              {spark.kind === "rank" ? "rank path" : "wr trend"}
            </span>
            <span>{spark.lastLabel}</span>
          </div>
        </div>
      )}
    </div>
  );
});
