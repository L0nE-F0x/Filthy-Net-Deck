import type { Matchup } from "../types/meta";

export function MatchupTable({ matchups }: { matchups: Matchup[] }) {
  if (!matchups.length) {
    return <p className="text-sm text-muted">No matchup notes for this deck yet.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {matchups.map((m) => (
        <div
          key={m.vs}
          className="rounded-xl border border-ink-600/50 bg-ink-900/40 px-3 py-2.5"
        >
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="font-semibold text-sm">vs {m.vs}</span>
            <span className={`text-xs font-bold uppercase tracking-wide favor-${m.favor}`}>
              {m.favor}
            </span>
          </div>
          <p className="text-sm text-muted m-0 leading-relaxed">{m.notes}</p>
        </div>
      ))}
    </div>
  );
}
