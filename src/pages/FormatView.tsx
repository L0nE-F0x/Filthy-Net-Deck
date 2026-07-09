import { useAppStore } from "../store/useAppStore";
import { BoModeToggle } from "../components/BoModeToggle";
import { TierBadge } from "../components/TierBadge";
import { ColorPips } from "../components/ColorPips";
import { IconBack } from "../components/NavIcons";
import { decksForMode } from "../services/deckHelpers";

export function FormatView() {
  const meta = useAppStore((s) => s.meta);
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const formatId = useAppStore((s) => s.selectedFormatId);
  const setPage = useAppStore((s) => s.setPage);
  const openDeck = useAppStore((s) => s.openDeck);

  const fmt = meta?.formats.find((f) => f.id === formatId);
  if (!meta || !fmt) {
    return (
      <div className="empty-state">
        <p>Format not found.</p>
        <button type="button" className="btn btn-ghost" onClick={() => setPage("daily")}>
          Back to Daily
        </button>
      </div>
    );
  }

  const deckList = decksForMode(fmt, mode, meta.decks);
  const related = meta.tournaments.filter(
    (t) => t.format === fmt.id || String(t.format).toLowerCase() === fmt.id,
  );

  return (
    <div className="flex flex-col gap-5 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button type="button" className="btn btn-ghost btn-sm mb-2" onClick={() => setPage("daily")}>
            <IconBack className="w-4 h-4" /> Daily
          </button>
          <p className="eyebrow">{fmt.featured ? "Featured format" : "Constructed"}</p>
          <h2 className="text-2xl font-semibold m-0 tracking-tight">{fmt.name}</h2>
          <p className="text-sm text-muted mt-2 mb-0 leading-relaxed">{fmt.metaNotes}</p>
        </div>
        <BoModeToggle mode={mode} onChange={setMode} />
      </div>

      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted m-0 mb-3">
          Today’s 8 · {mode.toUpperCase()}
        </h3>
        <div className="format-grid">
          {deckList.map((deck) => (
            <article
              key={deck.id}
              className="panel deck-card"
              onClick={() => openDeck(deck.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") openDeck(deck.id);
              }}
              role="button"
              tabIndex={0}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-gold-400">#{deck.rank}</span>
                <TierBadge tier={deck.tier} />
              </div>
              <h3 className="flex items-center gap-2 flex-wrap">
                {deck.name}
                <ColorPips colors={deck.colors} />
              </h3>
              <p className="line-clamp-3">{deck.description}</p>
              {deck.metaShare != null && (
                <p className="text-xs text-gold-300 m-0 mt-2">{deck.metaShare}% meta share</p>
              )}
              <button
                type="button"
                className="btn btn-primary btn-sm mt-3"
                onClick={(e) => {
                  e.stopPropagation();
                  openDeck(deck.id);
                }}
              >
                Open deck
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted m-0 mb-3">
          Tier board
        </h3>
        <div className="flex flex-col gap-4">
          {fmt.tiers.map((t) => (
            <div key={t.tier}>
              <div className="mb-2">
                <TierBadge tier={t.tier} />
              </div>
              <div className="flex flex-wrap gap-2">
                {t.archetypes.map((a) => (
                  <span
                    key={a}
                    className="text-sm px-2.5 py-1 rounded-lg bg-ink-800 border border-ink-600/50"
                  >
                    {a}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {related.length > 0 && (
        <section className="panel">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted m-0 mb-3">
            Recent results
          </h3>
          <ul className="m-0 p-0 list-none flex flex-col gap-2">
            {related.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-ink-700/50 last:border-0"
              >
                <div>
                  <div className="font-medium text-sm">{t.name}</div>
                  <div className="text-xs text-muted">
                    {t.date}
                    {t.players ? ` · ${t.players} players` : ""}
                    {t.source ? ` · ${t.source}` : ""}
                  </div>
                </div>
                <a
                  href={t.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ghost btn-sm"
                >
                  Open
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
