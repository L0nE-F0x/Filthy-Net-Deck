import { useEffect, useMemo } from "react";
import { useAppStore } from "../store/useAppStore";
import { TierBadge } from "../components/TierBadge";
import { ColorPips } from "../components/ColorPips";
import { SpoilerPulse } from "../components/SpoilerPulse";
import { MetaShareTimeline } from "../components/MetaShareTimeline";
import { PersonalMetaPanel } from "../components/PersonalMetaPanel";
import { decksForMode, topDeckForMode } from "../services/deckHelpers";
import { recordVsTags } from "../services/matchupNotes";
import { CardArtStrip, pickPreviewCards } from "../components/CardArt";
import type { Deck, FormatId, ManaColor } from "../types/meta";

type VsRecord = { wins: number; losses: number };

/** "You vs this archetype" chip — appears once opponents are tagged with it. */
function VsYouChip({ rec }: { rec: VsRecord | undefined }) {
  if (!rec || rec.wins + rec.losses === 0) return null;
  const rate = rec.wins / (rec.wins + rec.losses);
  const favor = rate >= 0.55 ? "favored" : rate >= 0.45 ? "even" : "unfavored";
  return (
    <span
      className={`vs-you-chip favor-${favor}`}
      title="Your record against opponents you tagged with this archetype (Matchup Lab)"
    >
      you {rec.wins}–{rec.losses}
    </span>
  );
}

function filterDecks(
  decks: Deck[],
  q: string,
  tier: 0 | 1 | 2 | 3,
  colors: string[],
): Deck[] {
  const query = q.trim().toLowerCase();
  return decks.filter((d) => {
    if (tier && d.tier !== tier) return false;
    // Multi-select colors: the deck must play every selected color.
    if (colors.length && !colors.every((c) => d.colors.includes(c as ManaColor)))
      return false;
    if (!query) return true;
    return (
      d.name.toLowerCase().includes(query) ||
      d.archetype.toLowerCase().includes(query) ||
      d.description.toLowerCase().includes(query)
    );
  });
}

type Movement = "up" | "down" | "new";

/** Movement chip (↑ / ↓ / new) from today's meta diff. */
function MovementChip({ move }: { move: Movement | undefined }) {
  if (!move) return null;
  const label = move === "up" ? "↑ rising" : move === "down" ? "↓ falling" : "+ new";
  return (
    <span className={`move-chip move-${move}`} title="Rank movement since the previous meta day">
      {label}
    </span>
  );
}

function DeckMiniCard({
  d,
  vs,
  move,
  onOpen,
}: {
  d: Deck;
  vs?: VsRecord;
  move?: Movement;
  onOpen: () => void;
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
        <span className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-gold-400">#{d.rank ?? "—"}</span>
          <MovementChip move={move} />
        </span>
        <span className="flex items-center gap-1.5">
          <VsYouChip rec={vs} />
          <TierBadge tier={d.tier} />
        </span>
      </div>
      <h3 className="flex items-center gap-2 flex-wrap">
        {d.name}
        <ColorPips colors={d.colors} />
      </h3>
      <p className="line-clamp-2">
        {d.metaShare != null ? `${d.metaShare}% · ` : ""}
        {d.archetype}
      </p>
      <CardArtStrip cards={pickPreviewCards(d)} max={4} />
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
  const filterColors = useAppStore((s) => s.filterColors);
  const toggleFilterColor = useAppStore((s) => s.toggleFilterColor);
  const metaDiff = useAppStore((s) => s.metaDiff);
  const dailyFormatId = useAppStore((s) => s.dailyFormatId);
  const setDailyFormatId = useAppStore((s) => s.setDailyFormatId);
  const trackerMatches = useAppStore((s) => s.trackerMatches);

  // Your record vs tagged archetypes (Matchup Lab) keyed by lowercased tag.
  const vsTagMap = useMemo(() => recordVsTags(trackerMatches), [trackerMatches]);
  const vsFor = (d: Deck): VsRecord | undefined =>
    vsTagMap[d.name.toLowerCase()] ?? vsTagMap[d.archetype.toLowerCase()];

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
      colors: filterColors,
    }),
    [searchQuery, filterTier, filterColors],
  );

  // Deck name → movement for the active format+mode, from today's diff.
  const activeFmtIdForDiff = activeFmt?.id ?? "";
  const movementByName = useMemo(() => {
    const out = new Map<string, Movement>();
    const ch = metaDiff.changes.find(
      (c) => c.formatId === activeFmtIdForDiff && c.mode === mode,
    );
    if (!ch) return out;
    for (const n of ch.entered) out.set(n.toLowerCase(), "new");
    for (const n of ch.rose) out.set(n.toLowerCase(), "up");
    for (const n of ch.fell) out.set(n.toLowerCase(), "down");
    return out;
  }, [metaDiff, activeFmtIdForDiff, mode]);

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
        filterOpts.colors,
      )
    : [];
  const hero = activeFmt ? topDeckForMode(activeFmt, mode, meta.decks) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="eyebrow">Today’s lists · {meta.date}</p>
        <p className="text-sm text-muted m-0 max-w-2xl">
          Pick a format below — eight ranked decks for the active Bo1/Bo3 mode. Open any deck
          for the full list, curve, and one-click Arena import.
        </p>
      </div>

      <SpoilerPulse />
      <MetaShareTimeline />
      <PersonalMetaPanel />

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
            className={`filter-chip${filterColors.includes(c) ? " active" : ""}`}
            onClick={() => toggleFilterColor(c)}
            title={`Filter ${c} — combine colors to find exact pairings`}
          >
            {c}
          </button>
        ))}
      </div>

      {metaDiff.previousDate && metaDiff.changes.length > 0 && (
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

      {activeFmt && hero && (
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
                    vs={vsFor(d)}
                    move={movementByName.get(d.name.toLowerCase())}
                    onOpen={() => openDeck(d.id)}
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
