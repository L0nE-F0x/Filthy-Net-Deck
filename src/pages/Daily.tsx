import { useMemo } from "react";
import { useAppStore } from "../store/useAppStore";
import { BoModeToggle } from "../components/BoModeToggle";
import { TierBadge } from "../components/TierBadge";
import { ColorPips } from "../components/ColorPips";
import { IconStar } from "../components/NavIcons";
import { decksForMode, topDeckForMode } from "../services/deckHelpers";
import { CardArtStrip, pickPreviewCards } from "../components/CardArt";
import type { Deck, FormatMeta, ManaColor } from "../types/meta";

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
            aria-label={fav ? "Remove from my queue" : "Add to my queue"}
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

function FormatDeckStrip({
  fmt,
  decks,
  mode,
  onOpenDeck,
  onOpenFormat,
  compact,
}: {
  fmt: FormatMeta;
  decks: Deck[];
  mode: "bo1" | "bo3";
  onOpenDeck: (id: string) => void;
  onOpenFormat: () => void;
  compact?: boolean;
}) {
  const favorites = useAppStore((s) => s.favorites);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  if (!decks.length) return null;
  return (
    <section className={compact ? "panel" : "panel panel-hero"}>
      <div
        className={`relative z-10 flex flex-wrap items-start justify-between gap-3 ${compact ? "mb-3" : "mb-4"}`}
      >
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span
              className={`text-xs font-bold tracking-widest uppercase ${
                fmt.featured ? "text-gold-400" : "text-azure-300"
              }`}
            >
              {fmt.featured ? "Featured · " : ""}
              {fmt.name}
            </span>
            <span className="text-xs text-muted">
              {mode.toUpperCase()} · {decks.length} decks
            </span>
          </div>
          {!compact && (
            <p className="text-sm text-muted m-0 max-w-2xl leading-relaxed">{fmt.metaNotes}</p>
          )}
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenFormat}>
          Full format view
        </button>
      </div>
      <div className="relative z-10 format-grid">
        {decks.map((d) => (
          <DeckMiniCard
            key={d.id}
            d={d}
            fav={favorites.includes(d.id)}
            onOpen={() => onOpenDeck(d.id)}
            onToggleFav={() => toggleFavorite(d.id)}
          />
        ))}
      </div>
    </section>
  );
}

export function Daily() {
  const meta = useAppStore((s) => s.meta);
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
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

  const standard = meta?.formats.find((f) => f.featured) ?? meta?.formats[0];
  const rest = meta?.formats.filter((f) => f.id !== standard?.id) ?? [];

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

  const standardDecks = standard
    ? filterDecks(
        decksForMode(standard, mode, meta.decks),
        filterOpts.q,
        filterOpts.tier,
        filterOpts.color,
        filterOpts.favOnly,
        filterOpts.favorites,
      )
    : [];
  const hero = standard ? topDeckForMode(standard, mode, meta.decks) : undefined;
  const favDecks = favorites
    .map((id) => meta.decks[id])
    .filter((d): d is Deck => Boolean(d) && d.mode === mode);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Daily picks · {meta.date}</p>
          <p className="text-sm text-muted m-0 max-w-xl">
            <strong className="text-foam">8 full decklists × 8 formats</strong>. Star decks for My
            Queue. Search and filter anytime.
          </p>
        </div>
        <BoModeToggle mode={mode} onChange={setMode} />
      </div>

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
          ★ My queue ({favorites.length})
        </button>
      </div>

      {metaDiff.previousDate && metaDiff.changes.length > 0 && (
        <section className="panel diff-panel">
          <h3 className="text-sm font-semibold m-0 mb-2">
            Meta movement since {metaDiff.previousDate}
          </h3>
          <div className="max-h-40 overflow-auto">
            {metaDiff.changes.slice(0, 12).map((ch) => (
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
                  {ch.left.slice(0, 2).map((n) => (
                    <span key={n} className="diff-down mr-2">
                      − {n}
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
            My queue · {mode.toUpperCase()}
          </h3>
          {favDecks.length === 0 ? (
            <p className="text-sm text-muted m-0">
              Star decks from the lists below to pin them here.
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

      {standard && hero && !showFavoritesOnly && (
        <section className="panel panel-hero">
          <div className="relative z-10 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-xs font-bold tracking-widest uppercase text-gold-400">
                  Today’s #1 · Standard
                </span>
                <TierBadge tier={hero.tier} />
                <ColorPips colors={hero.colors} />
                {hero.metaShare != null && (
                  <span className="text-xs text-muted">{hero.metaShare}% meta</span>
                )}
              </div>
              <h2 className="text-2xl font-semibold m-0 tracking-tight">{hero.name}</h2>
              <p className="text-sm text-muted mt-2 mb-0 leading-relaxed max-w-2xl">
                {hero.description}
              </p>
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <button type="button" className="btn btn-primary" onClick={() => openDeck(hero.id)}>
                Open #1 deck
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => openFormat(standard.id)}
              >
                All Standard decks
              </button>
            </div>
          </div>
          <div className="relative z-10">
            <h3 className="text-sm font-semibold text-muted uppercase tracking-wide m-0 mb-3">
              Standard · filtered ({standardDecks.length})
            </h3>
            <div className="format-grid">
              {standardDecks.map((d) => (
                <DeckMiniCard
                  key={d.id}
                  d={d}
                  fav={favorites.includes(d.id)}
                  onOpen={() => openDeck(d.id)}
                  onToggleFav={() => useAppStore.getState().toggleFavorite(d.id)}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {!showFavoritesOnly &&
        rest.map((fmt) => {
          const decks = filterDecks(
            decksForMode(fmt, mode, meta.decks),
            filterOpts.q,
            filterOpts.tier,
            filterOpts.color,
            filterOpts.favOnly,
            filterOpts.favorites,
          );
          if (!decks.length) return null;
          return (
            <FormatDeckStrip
              key={fmt.id}
              fmt={fmt}
              decks={decks}
              mode={mode}
              compact
              onOpenDeck={openDeck}
              onOpenFormat={() => openFormat(fmt.id)}
            />
          );
        })}
    </div>
  );
}
