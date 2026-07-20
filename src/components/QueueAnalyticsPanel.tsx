import { useMemo } from "react";
import { queueSplits } from "../services/queueAnalytics";
import { pct } from "../services/gameAnalytics";
import type { TrackedMatch } from "../types/tracker";

/**
 * WR by Arena queue (Ladder, Traditional, events) — pure local aggregate.
 */
export function QueueAnalyticsPanel({ matches }: { matches: TrackedMatch[] }) {
  const rows = useMemo(() => queueSplits(matches, { minGames: 2 }), [matches]);

  if (rows.length === 0) return null;

  return (
    <section className="panel">
      <p className="eyebrow m-0 mb-1">By queue</p>
      <h3 className="text-sm font-semibold m-0 mb-2">
        Your record per Arena queue
        <span className="text-muted font-normal"> · decided matches only</span>
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted text-left">
              <th className="py-1 pr-2 font-medium">Queue</th>
              <th className="py-1 pr-2 font-medium">Record</th>
              <th className="py-1 pr-2 font-medium">WR</th>
              <th className="py-1 font-medium">Bo3 share</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.eventId} className="border-t border-white/5">
                <td className="py-1 pr-2">{r.label}</td>
                <td className="py-1 pr-2">
                  {r.wins}–{r.losses}
                </td>
                <td className="py-1 pr-2">{pct(r.rate)}</td>
                <td className="py-1 text-muted">
                  {r.bo3Share == null
                    ? "—"
                    : `${Math.round(r.bo3Share * 100)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
