import { useAppStore } from "../store/useAppStore";
import { TierBadge } from "../components/TierBadge";
import { ColorPips } from "../components/ColorPips";
import { IconBack, IconStar } from "../components/NavIcons";
import { CardArt, CardArtStrip, pickPreviewCards } from "../components/CardArt";
import {
  AnalysisPanel,
  ColorIdentityBars,
  MetaShareBars,
  TierDonut,
} from "../components/MetaCharts";
import { decksForMode } from "../services/deckHelpers";
import { canShowResultsLink } from "../services/links";
import { openExternal } from "../services/openExternal";

export function FormatView() {
  const meta = useAppStore((s) => s.meta);
  const mode = useAppStore((s) => s.mode);
  const formatId = useAppStore((s) => s.selectedFormatId);
  const setPage = useAppStore((s) => s.setPage);
  const openDeck = useAppStore((s) => s.openDeck);
  const favorites = useAppStore((s) => s.favorites);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);

  const fmt = meta?.formats.find((f) => f.id === formatId);
  if (!meta || !fmt) {
    return (
      <div className="empty-state">
        <p>Format not found{formatId ? ` (${formatId})` : ""}.</p>
        <button type="button" className="btn btn-ghost mt-3" onClick={() => setPage("daily")}>
          Back to Decks
        </button>
        <button type="button" className="btn btn-ghost mt-2" onClick={() => setPage("meta")}>
          Back to Events
        </button>
      </div>
    );
  }

  const deckList = decksForMode(fmt, mode, meta.decks);
  const related = meta.tournaments.filter(
    (t) =>
      (t.format === fmt.id || String(t.format).toLowerCase() === fmt.id) &&
      canShowResultsLink(t.url),
  );
  const hero = deckList[0];
  const heroArts = hero ? pickPreviewCards(hero) : [];

  return (
    <div className="flex flex-col gap-4 max-w-6xl format-dashboard">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap gap-2 mb-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPage("daily")}>
              <IconBack className="w-4 h-4" /> Decks
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPage("meta")}>
              Events
            </button>
          </div>
          <p className="eyebrow">{fmt.featured ? "Featured format" : "Constructed"}</p>
          <h2 className="text-2xl font-semibold m-0 tracking-tight">{fmt.name}</h2>
          <p className="text-sm text-muted mt-2 mb-0 leading-relaxed max-w-2xl">{fmt.metaNotes}</p>
        </div>
      </div>

      {hero && (
        <section className="panel panel-hero format-hero">
          <div className="relative z-10 format-hero-grid">
            <div className="format-hero-copy">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-xs font-bold tracking-widest uppercase text-gold-400">
                  #{hero.rank} · {mode.toUpperCase()} pick
                </span>
                <TierBadge tier={hero.tier} />
                <ColorPips colors={hero.colors} />
              </div>
              <h3 className="text-xl font-semibold m-0">{hero.name}</h3>
              <p className="text-sm text-muted mt-2 mb-3 leading-relaxed">{hero.description}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-primary" onClick={() => openDeck(hero.id)}>
                  Open full decklist
                </button>
                <button
                  type="button"
                  className={`btn btn-ghost star-btn${favorites.includes(hero.id) ? " on" : ""}`}
                  onClick={() => toggleFavorite(hero.id)}
                >
                  <IconStar className="w-4 h-4" filled={favorites.includes(hero.id)} /> Queue
                </button>
              </div>
            </div>
            <div className="format-hero-art">
              {heroArts.slice(0, 3).map((c, i) => (
                <div key={c.name} className={`hero-card hero-card-${i}`}>
                  <CardArt
                    name={c.name}
                    scryfallId={c.scryfallId}
                    size="normal"
                    className="hero-card-img"
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <div className="dashboard-grid">
        <section className="panel">
          <h3 className="dash-title">Meta share · {mode.toUpperCase()}</h3>
          <MetaShareBars decks={deckList} />
        </section>
        <section className="panel">
          <h3 className="dash-title">Tier mix</h3>
          <TierDonut decks={deckList} />
        </section>
        <section className="panel">
          <h3 className="dash-title">Color identity pressure</h3>
          <ColorIdentityBars decks={deckList} />
        </section>
        <section className="panel dash-span-2">
          <AnalysisPanel fmt={fmt} decks={deckList} mode={mode} />
        </section>
      </div>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted m-0">
              All {deckList.length} decks · {mode.toUpperCase()}
            </h3>
            <p className="text-xs text-muted m-0 mt-1">
              Order changes with Bo1 vs Bo3. Click for full list, curve, and Arena import.
            </p>
          </div>
        </div>
        <div className="format-deck-stack">
          {deckList.map((deck) => {
            const arts = pickPreviewCards(deck);
            const mainCount = deck.mainboard.reduce((n, c) => n + c.count, 0);
            return (
              <article
                key={deck.id}
                className="panel deck-card format-deck-row"
                onClick={() => openDeck(deck.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") openDeck(deck.id);
                }}
                role="button"
                tabIndex={0}
              >
                <div className="format-deck-rank">
                  <span>#{deck.rank}</span>
                  <TierBadge tier={deck.tier} />
                </div>
                <div className="format-deck-body">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold m-0">{deck.name}</h3>
                    <ColorPips colors={deck.colors} />
                    {deck.metaShare != null && (
                      <span className="text-xs text-gold-300">{deck.metaShare}%</span>
                    )}
                    <span className="text-xs text-muted">{mainCount} cards</span>
                  </div>
                  <p className="text-sm text-muted m-0 mt-1 line-clamp-2">{deck.description}</p>
                  <CardArtStrip cards={arts} max={5} />
                </div>
                <div className="format-deck-actions">
                  <button
                    type="button"
                    className={`star-btn${favorites.includes(deck.id) ? " on" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(deck.id);
                    }}
                  >
                    <IconStar className="w-4 h-4" filled={favorites.includes(deck.id)} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      openDeck(deck.id);
                    }}
                  >
                    Decklist
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {related.length > 0 && (
        <section className="panel">
          <h3 className="dash-title">Recent results</h3>
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
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => void openExternal(t.url)}
                >
                  Open
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
