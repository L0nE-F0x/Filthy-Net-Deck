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

/** Hide internal/legacy labels from the UI */
const HIDDEN_SOURCES = new Set(["seed", "spicerack", "placeholder"]);

const SOURCE_LINKS: Record<string, string> = {
  mtggoldfish: "https://www.mtggoldfish.com/metagame/standard",
  untapped: "https://mtga.untapped.gg/constructed/standard/meta",
  melee: "https://melee.gg/Tournament/Search",
  scryfall: "https://scryfall.com",
  wizards: "https://magic.wizards.com/en/mtgarena",
};

export function MetaPulse() {
  const meta = useAppStore((s) => s.meta);
  const openFormat = useAppStore((s) => s.openFormat);

  if (!meta) {
    return <div className="empty-state loading-pulse">Loading meta pulse…</div>;
  }

  const sources = (meta.sources || []).filter(
    (s) => !HIDDEN_SOURCES.has(s.toLowerCase()),
  );
  const sorted = [...meta.tournaments].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      <div>
        <p className="eyebrow">Meta pulse</p>
        <h2 className="text-2xl font-semibold m-0 tracking-tight">Tournament intel</h2>
        <p className="text-sm text-muted mt-2 mb-0 max-w-2xl leading-relaxed">
          Recent paper, MTGO, and Arena results informing today’s ranked decks. Snapshot as of{" "}
          {meta.date}.
        </p>
      </div>

      <section className="panel">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted m-0 mb-3">
          Data sources
        </h3>
        <div className="flex flex-wrap gap-2">
          {sources.map((s) => {
            const href = SOURCE_LINKS[s.toLowerCase()];
            const label = s === "mtggoldfish" ? "MTGGoldfish" : s === "untapped" ? "Untapped.gg" : s;
            if (href) {
              return (
                <a
                  key={s}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs px-2.5 py-1 rounded-lg bg-ink-800 border border-ink-600/50 capitalize hover:border-gold-500/40 text-foam no-underline"
                >
                  {label}
                </a>
              );
            }
            return (
              <span
                key={s}
                className="text-xs px-2.5 py-1 rounded-lg bg-ink-800 border border-ink-600/50 capitalize"
              >
                {label}
              </span>
            );
          })}
        </div>
        <p className="text-xs text-muted mt-3 mb-0 leading-relaxed">
          Live daily pipeline pulls public tournament lists from{" "}
          <strong className="text-foam">MTGGoldfish</strong>, event discovery from{" "}
          <strong className="text-foam">Melee.gg</strong>, and Arena ladder context via{" "}
          <strong className="text-foam">Untapped.gg</strong>. Card images via Scryfall. Results
          buttons open real pages only.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        {sorted.length === 0 && (
          <div className="empty-state">No tournaments in this feed. Tap Refresh.</div>
        )}
        {sorted.map((t) => (
          <article key={t.id} className="panel">
            <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className={platformClass(t.platform)}>{platformLabel(t.platform)}</span>
                  <span className="text-xs text-muted uppercase tracking-wide">{t.format}</span>
                  <span className="text-xs text-muted">{t.date}</span>
                  {t.source && (
                    <span className="text-xs text-muted capitalize">· {t.source}</span>
                  )}
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
            {t.topDecks.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {t.topDecks.map((d) => (
                  <span
                    key={`${t.id}-${d.place}-${d.archetype}`}
                    className="text-xs px-2 py-1 rounded-md bg-ink-900 border border-ink-600/40"
                  >
                    <span className="text-gold-400 font-semibold">#{d.place}</span> {d.archetype}
                    {d.pilot ? ` · ${d.pilot}` : ""}
                  </span>
                ))}
              </div>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
