import { useEffect, useMemo } from "react";
import { useAppStore } from "../store/useAppStore";
import { TierBadge } from "../components/TierBadge";
import { ColorPips } from "../components/ColorPips";
import { IconStar } from "../components/NavIcons";
import { decksForMode, topDeckForMode } from "../services/deckHelpers";
import { CardArtStrip, pickPreviewCards } from "../components/CardArt";
import type { Deck, FormatId, ManaColor } from "../types/meta";

function filterDecks(
  decks: Deck[],
  q: string,
  tier: 0 | 1 | 2 | 3,
  color: string | null,
  favOnly: boolean,
  favorites: string[],
): Deck[] {
  const query = q.trim().toLowerCase();
  return decks.filter((d) => {
    if (favOnly && !favorites.includes(d.id)) return false;
    if (tier && d.tier !== tier) return false;
    if (color && !d.colors.includes(color as ManaColor)) return false;
    if (!query) return true;
    return (
      d.name.toLowerCase().includes(query) ||
      d.archetype.toLowerCase().includes(query) ||
      d.description.toLowerCase().includes(query)
    );
  });
}

function DeckMiniCard({
  d,
  onOpen,
  onToggleFav,
  fav,
}: {
  d: Deck;
  onOpen: () => void;
  onToggleFav: () => void;
  fav: boolean;
}) {
  return (
    <article
      className="panel deck-card"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpen();
      }}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-gold-400">#{d.rank ?? "—"}</span>
        <div className="flex items-center gap-1">
          <TierBadge tier={d.tier} />
          <button
            type="button"
            className={`star-btn${fav ? " on" : ""}`}
            aria-label={fav ? "Remove from queue" : "Add to queue"}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFav();
            }}
          >
            <IconStar className="w-4 h-4" filled={fav} />
          </button>
        </div>
      </div>
      <h3 className="flex items-center gap-2 flex-wrap">
        {d.name}
        <ColorPips colors={d.colors} />
      </h3>
      <p className="line-clamp-2">
        {d.metaShare != null ? `${d.metaShare}% · ` : ""}
        {d.archetype}
      </p>
      <CardArtStrip names={pickPreviewCards(d.mainboard, d.commander)} max={4} />
    </article>
  );
}

export function Daily() {
  const meta = useAppStore((s) => s.meta);
  const mode = useAppStore((s) => s.mode);
  const openFormat = useAppStore((s) => s.openFormat);
  const openDeck = useAppStore((s) => s.openDeck);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const filterTier = useAppStore((s) => s.filterTier);
  const setFilterTier = useAppStore((s) => s.setFilterTier);
  const filterColor = useAppStore((s) => s.filterColor);
  const setFilterColor = useAppStore((s) => s.setFilterColor);
  const showFavoritesOnly = useAppStore((s) => s.showFavoritesOnly);
  const setShowFavoritesOnly = useAppStore((s) => s.setShowFavoritesOnly);
  const favorites = useAppStore((s) => s.favorites);
  const metaDiff = useAppStore((s) => s.metaDiff);
  const dailyFormatId = useAppStore((s) => s.dailyFormatId);
  const setDailyFormatId = useAppStore((s) => s.setDailyFormatId);

  // Default to featured Standard when meta loads
  useEffect(() => {
    if (!meta?.formats?.length) return;
    if (dailyFormatId && meta.formats.some((f) => f.id === dailyFormatId)) return;
    const featured = meta.formats.find((f) => f.featured) ?? meta.formats[0];
    setDailyFormatId(featured.id as FormatId);
  }, [meta, dailyFormatId, setDailyFormatId]);

  const activeFmt =
    meta?.formats.find((f) => f.id === dailyFormatId) ??
    meta?.formats.find((f) => f.featured) ??
    meta?.formats[0];

  const filterOpts = useMemo(
    () => ({
      q: searchQuery,
      tier: filterTier,
      color: filterColor,
      favOnly: showFavoritesOnly,
      favorites,
    }),
    [searchQuery, filterTier, filterColor, showFavoritesOnly, favorites],
  );

  if (!meta) {
    return (
      <div className="empty-state">
        <div className="skel skel-line w-64" style={{ margin: "0 auto 0.5rem" }} />
        <div className="skel skel-line w-40" style={{ margin: "0 auto" }} />
        <p className="mt-4 loading-pulse">Loading today’s meta…</p>
      </div>
    );
  }

  const activeDecks = activeFmt
    ? filterDecks(
        decksForMode(activeFmt, mode, meta.decks),
        filterOpts.q,
        filterOpts.tier,
        filterOpts.color,
        filterOpts.favOnly,
        filterOpts.favorites,
      )
    : [];
  const hero = activeFmt ? topDeckForMode(activeFmt, mode, meta.decks) : undefined;
  const favDecks = favorites
    .map((id) => meta.decks[id])
    .filter((d): d is Deck => Boolean(d) && d.mode === mode);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="eyebrow">Today’s lists · {meta.date}</p>
        <p className="text-sm text-muted m-0 max-w-2xl">
          Pick a format below — eight ranked decks for the active Bo1/Bo3 mode. Star any deck for
          your queue.
        </p>
      </div>

      {/* Format switcher for hero + list */}
      {!showFavoritesOnly && (
        <div className="format-switcher" role="tablist" aria-label="Format">
          {meta.formats.map((f) => {
            const active = f.id === activeFmt?.id;
            return (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`format-chip${active ? " active" : ""}`}
                onClick={() => setDailyFormatId(f.id as FormatId)}
              >
                {f.shortLabel || f.name}
              </button>
            );
          })}
        </div>
      )}

      <div className="filter-bar">
        <input
          type="search"
          placeholder="Search archetypes…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search decks"
        />
        {([0, 1, 2, 3] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={`filter-chip${filterTier === t ? " active" : ""}`}
            onClick={() => setFilterTier(t)}
          >
            {t === 0 ? "All tiers" : `T${t}`}
          </button>
        ))}
        {(["W", "U", "B", "R", "G"] as const).map((c) => (
          <button
            key={c}
            type="button"
            className={`filter-chip${filterColor === c ? " active" : ""}`}
            onClick={() => setFilterColor(filterColor === c ? null : c)}
            title={`Filter ${c}`}
          >
            {c}
          </button>
        ))}
        <button
          type="button"
          className={`filter-chip${showFavoritesOnly ? " active" : ""}`}
          onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
        >
          ★ Queue ({favorites.length})
        </button>
      </div>

      {metaDiff.previousDate && metaDiff.changes.length > 0 && !showFavoritesOnly && (
        <section className="panel diff-panel">
          <h3 className="text-sm font-semibold m-0 mb-2">
            Meta movement since {metaDiff.previousDate}
          </h3>
          <div className="max-h-36 overflow-auto">
            {metaDiff.changes.slice(0, 10).map((ch) => (
              <div key={`${ch.formatId}-${ch.mode}`} className="diff-row">
                <span className="text-muted">
                  {ch.formatName} {ch.mode.toUpperCase()}
                </span>
                <span>
                  {ch.rose.slice(0, 2).map((n) => (
                    <span key={n} className="diff-up mr-2">
                      ↑ {n}
                    </span>
                  ))}
                  {ch.fell.slice(0, 2).map((n) => (
                    <span key={n} className="diff-down mr-2">
                      ↓ {n}
                    </span>
                  ))}
                  {ch.entered.slice(0, 2).map((n) => (
                    <span key={n} className="diff-new mr-2">
                      + {n}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {showFavoritesOnly && (
        <section className="panel">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted m-0 mb-3">
            Your queue · {mode.toUpperCase()}
          </h3>
          {favDecks.length === 0 ? (
            <p className="text-sm text-muted m-0">
              Star decks from any format to pin them here. Switch Bo1/Bo3 in the top bar.
            </p>
          ) : (
            <div className="format-grid">
              {favDecks.map((d) => (
                <DeckMiniCard
                  key={d.id}
                  d={d}
                  fav
                  onOpen={() => openDeck(d.id)}
                  onToggleFav={() => useAppStore.getState().toggleFavorite(d.id)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {activeFmt && hero && !showFavoritesOnly && (
        <section className="panel panel-hero">
          <div className="relative z-10 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-xs font-bold tracking-widest uppercase text-gold-400">
                  {activeFmt.name} · #{hero.rank ?? 1} · {mode.toUpperCase()}
                </span>
                <TierBadge tier={hero.tier} />
                <ColorPips colors={hero.colors} />
                {hero.metaShare != null && (
                  <span className="text-xs text-muted">{hero.metaShare}% meta</span>
                )}
                {hero.listQuality === "authoritative" && (
                  <span className="badge-verified">Verified list</span>
                )}
              </div>
              <h2 className="text-2xl font-semibold m-0 tracking-tight">{hero.name}</h2>
              <p className="text-sm text-muted mt-2 mb-0 leading-relaxed max-w-2xl">
                {hero.description}
              </p>
              {hero.listNote && (
                <p className="text-xs text-muted mt-2 mb-0 opacity-80">{hero.listNote}</p>
              )}
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <button type="button" className="btn btn-primary" onClick={() => openDeck(hero.id)}>
                Open deck
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => openFormat(activeFmt.id)}
              >
                Format details
              </button>
            </div>
          </div>
          <div className="relative z-10">
            <h3 className="text-sm font-semibold text-muted uppercase tracking-wide m-0 mb-3">
              {activeFmt.name} · top {activeDecks.length}
            </h3>
            {activeDecks.length === 0 ? (
              <p className="text-sm text-muted m-0">No decks match these filters.</p>
            ) : (
              <div className="format-grid">
                {activeDecks.map((d) => (
                  <DeckMiniCard
                    key={d.id}
                    d={d}
                    fav={favorites.includes(d.id)}
                    onOpen={() => openDeck(d.id)}
                    onToggleFav={() => useAppStore.getState().toggleFavorite(d.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
