import { useMemo } from "react";
import { queueLabel, seasonKeyOf, seasonLabel } from "../../services/tracker";
import { gamePlayDrawSplit, mulliganStats } from "../../services/gameAnalytics";
import { tallyMatches } from "../../services/statsHelpers";
import type { TrackedMatch } from "../../types/tracker";
import { RateBar } from "./statsUi";

/**
 * Finer-grained win rates: play vs draw (per game), Bo1 vs Bo3, and
 * optionally per queue and per season.
 */
export function SplitsPanel({
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

    const bo1 = tallyMatches(matches.filter((m) => m.bestOf === 1));
    const bo3 = tallyMatches(matches.filter((m) => m.bestOf === 3));
    if (bo1.decided > 0 && bo3.decided > 0) {
      out.push({ label: "Best of one", wins: bo1.wins, losses: bo1.losses });
      out.push({ label: "Best of three", wins: bo3.wins, losses: bo3.losses });
    }

    if (showQueues) {
      const queues = [...new Set(matches.map((m) => m.eventId))];
      if (queues.length > 1) {
        for (const q of queues.sort()) {
          const t = tallyMatches(matches.filter((m) => m.eventId === q));
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
          const t = tallyMatches(matches.filter((m) => seasonKeyOf(m.endedAt) === s));
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
