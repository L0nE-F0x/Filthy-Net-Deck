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

      {deckList.length < 8 && (
        <div className="panel border border-fair/40 text-sm text-fair">
          Only {deckList.length} deck(s) in this feed. Tap Refresh, or reinstall the latest app —
          each format should ship with 8 full lists for Bo1 and Bo3.
        </div>
      )}

      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted m-0 mb-1">
          All {deckList.length || 8} decks · {mode.toUpperCase()}
        </h3>
        <p className="text-xs text-muted m-0 mb-3">
          Click any card for the full mainboard, sideboard, matchups, and Arena import.
        </p>
        <div className="flex flex-col gap-3">
          {deckList.map((deck) => {
            const mainCount = deck.mainboard.reduce((n, x) => n + x.count, 0);
            const sbCount = deck.sideboard.reduce((n, x) => n + x.count, 0);
            const preview = deck.mainboard.slice(0, 6);
            return (
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
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-sm font-bold text-gold-400">#{deck.rank ?? "—"}</span>
                      <TierBadge tier={deck.tier} />
                      <ColorPips colors={deck.colors} />
                      {deck.metaShare != null && (
                        <span className="text-xs text-muted">{deck.metaShare}% meta</span>
                      )}
                      <span className="text-xs text-muted">
                        {mainCount} main
                        {sbCount > 0 ? ` · ${sbCount} SB` : ""}
                      </span>
                    </div>
                    <h3 className="text-lg font-semibold m-0">{deck.name}</h3>
                    <p className="text-sm text-muted mt-1 mb-2 leading-relaxed">{deck.description}</p>
                    <div className="card-list selectable text-[11px] opacity-90">
                      {preview.map((card) => (
                        <div key={card.name} className="card-list-row border-0 py-0">
                          <span className="count">{card.count}</span>
                          <span>{card.name}</span>
                        </div>
                      ))}
                      {deck.mainboard.length > 6 && (
                        <div className="text-muted pt-1">
                          +{deck.mainboard.length - 6} more cards in full list…
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      openDeck(deck.id);
                    }}
                  >
                    Full decklist
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted m-0 mb-3">
          Tier board (quick jump)
        </h3>
        <div className="flex flex-col gap-4">
          {fmt.tiers.map((t) => (
            <div key={t.tier}>
              <div className="mb-2">
                <TierBadge tier={t.tier} />
              </div>
              <div className="flex flex-wrap gap-2">
                {t.archetypes.map((a) => {
                  const match = deckList.find(
                    (d) => d.archetype === a || d.name === a,
                  );
                  return (
                    <button
                      key={a}
                      type="button"
                      className="text-sm px-2.5 py-1 rounded-lg bg-ink-800 border border-ink-600/50 hover:border-gold-500/40 cursor-pointer"
                      onClick={() => match && openDeck(match.id)}
                      disabled={!match}
                      title={match ? "Open full decklist" : "No list for this mode"}
                    >
                      {a}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {fmt.metaShareTop && fmt.metaShareTop.length > 0 && (
          <div className="mt-5 pt-4 border-t border-ink-600/40 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {fmt.metaShareTop.map((m) => (
              <div key={m.name}>
                <div className="text-base font-semibold text-gold-300">{m.pct}%</div>
                <div className="text-xs text-muted">{m.name}</div>
              </div>
            ))}
          </div>
        )}
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
