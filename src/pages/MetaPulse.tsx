import { useAppStore } from "../store/useAppStore";
import type { TournamentPlatform } from "../types/meta";

function platformClass(p: TournamentPlatform): string {
  return `platform-chip platform-${p}`;
}

function platformLabel(p: TournamentPlatform): string {
  if (p === "mtga") return "MTGA";
  if (p === "mtgo") return "MTGO";
  return "Paper";
}

export function MetaPulse() {
  const meta = useAppStore((s) => s.meta);
  const openFormat = useAppStore((s) => s.openFormat);

  if (!meta) {
    return <div className="empty-state loading-pulse">Loading meta pulse…</div>;
  }

  const sorted = [...meta.tournaments].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      <div>
        <p className="eyebrow">Meta pulse</p>
        <h2 className="text-2xl font-semibold m-0 tracking-tight">Tournament intel</h2>
        <p className="text-sm text-muted mt-2 mb-0 max-w-2xl leading-relaxed">
          Recent paper, MTGO, and Arena results feeding today’s deck recommendations. Snapshot as of{" "}
          {meta.date}.
        </p>
      </div>

      <section className="panel">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted m-0 mb-3">
          Data sources
        </h3>
        <div className="flex flex-wrap gap-2">
          {meta.sources.map((s) => (
            <span
              key={s}
              className="text-xs px-2.5 py-1 rounded-lg bg-ink-800 border border-ink-600/50 capitalize"
            >
              {s}
            </span>
          ))}
        </div>
        <p className="text-xs text-muted mt-3 mb-0 leading-relaxed">
          Daily pipeline aggregates public signals from MTGGoldfish, Melee.gg (paper/RCQ events),
          Wizards/Arena notes, and Scryfall. Built-in seed keeps the app useful offline. (Spicerack
          TO software has shut down — we do not depend on it.)
        </p>
      </section>

      <section className="flex flex-col gap-3">
        {sorted.map((t) => (
          <article key={t.id} className="panel">
            <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className={platformClass(t.platform)}>{platformLabel(t.platform)}</span>
                  <span className="text-xs text-muted uppercase tracking-wide">{t.format}</span>
                  <span className="text-xs text-muted">{t.date}</span>
                </div>
                <h3 className="text-base font-semibold m-0">{t.name}</h3>
                {t.players != null && (
                  <p className="text-xs text-muted m-0 mt-1">{t.players} players</p>
                )}
              </div>
              <div className="flex gap-2">
                {meta.formats.some((f) => f.id === t.format) && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => openFormat(t.format as never)}
                  >
                    Format
                  </button>
                )}
                <a
                  href={t.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary btn-sm"
                >
                  Results
                </a>
              </div>
            </div>
            {t.notes && <p className="text-sm text-muted m-0 mb-3 leading-relaxed">{t.notes}</p>}
            <div className="flex flex-wrap gap-2">
              {t.topDecks.map((d) => (
                <span
                  key={`${t.id}-${d.place}-${d.archetype}`}
                  className="text-xs px-2 py-1 rounded-md bg-ink-900 border border-ink-600/40"
                >
                  <span className="text-gold-400 font-semibold">#{d.place}</span>{" "}
                  {d.archetype}
                  {d.pilot ? ` · ${d.pilot}` : ""}
                </span>
              ))}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
