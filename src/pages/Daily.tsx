import { useEffect, useMemo } from "react";
import { useAppStore } from "../store/useAppStore";
import { TierBadge } from "../components/TierBadge";
import { ColorPips } from "../components/ColorPips";
import { BanPulse } from "../components/BanPulse";
import { SpoilerPulse } from "../components/SpoilerPulse";
import { MetaShareTimeline } from "../components/MetaShareTimeline";
import { PersonalMetaPanel } from "../components/PersonalMetaPanel";
import { OpponentArchetypePanel } from "../components/OpponentArchetypePanel";
import { TrackerOnboarding } from "../components/TrackerOnboarding";
import { DailyDigestStrip } from "../components/DailyDigestStrip";
import { decksForMode, topDeckForMode } from "../services/deckHelpers";
import { recordVsTags, listTaggedOpponentCount } from "../services/matchupNotes";
import { needsOnboardingCoach } from "../services/trackerHealth";
import { CardArt, CardArtStrip, pickPreviewCards } from "../components/CardArt";
import type { Deck, FormatId, ManaColor } from "../types/meta";

type VsRecord = { wins: number; losses: number };

/** "You vs this archetype" chip — opens Matchup Lab filtered by tag (D2). */
function VsYouChip({
  rec,
  tag,
  onOpenTag,
}: {
  rec: VsRecord | undefined;
  tag: string;
  onOpenTag: (tag: string) => void;
}) {
  if (!rec || rec.wins + rec.losses === 0) return null;
  const rate = rec.wins / (rec.wins + rec.losses);
  const favor = rate >= 0.55 ? "favored" : rate >= 0.45 ? "even" : "unfavored";
  return (
    <button
      type="button"
      className={`vs-you-chip favor-${favor} vs-you-chip-btn`}
      title={`Your record vs “${tag}”: ${rec.wins}–${rec.losses} (${Math.round(rate * 100)}%) — open Matchup Lab`}
      onClick={(e) => {
        e.stopPropagation();
        onOpenTag(tag);
      }}
    >
      you {rec.wins}–{rec.losses}
    </button>
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
  const tip =
    move === "up"
      ? "Rank improved vs the previous meta day"
      : move === "down"
        ? "Rank fell vs the previous meta day"
        : "New on today’s top board (wasn’t ranked yesterday)";
  return (
    <span className={`move-chip move-${move}`} title={tip}>
      {label}
    </span>
  );
}

function DeckMiniCard({
  d,
  vs,
  move,
  onOpen,
  onOpenTag,
}: {
  d: Deck;
  vs?: VsRecord;
  move?: Movement;
  onOpen: () => void;
  onOpenTag: (tag: string) => void;
}) {
  const cardTip = [
    `#${d.rank ?? "—"} ${d.name}`,
    d.metaShare != null ? `${d.metaShare}% meta` : null,
    `Tier ${d.tier}`,
    d.archetype,
    vs && vs.wins + vs.losses > 0 ? `You ${vs.wins}–${vs.losses} vs this tag` : null,
    "Click to open decklist",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <article
      className="panel deck-card"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpen();
      }}
      role="button"
      tabIndex={0}
      title={cardTip}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-gold-400" title={`Meta rank #${d.rank ?? "—"}`}>
            #{d.rank ?? "—"}
          </span>
          <MovementChip move={move} />
        </span>
        <span className="flex items-center gap-1.5">
          <VsYouChip rec={vs} tag={d.archetype || d.name} onOpenTag={onOpenTag} />
          <TierBadge tier={d.tier} />
        </span>
      </div>
      <h3 className="flex items-center gap-2 flex-wrap">
        {d.name}
        <ColorPips colors={d.colors} />
      </h3>
      <p className="line-clamp-2" title={d.description || d.archetype}>
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
  const openMatchupTag = useAppStore((s) => s.openMatchupTag);
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
  const trackerStatus = useAppStore((s) => s.trackerStatus);
  const showOnboarding = useMemo(() => {
    const tagged = listTaggedOpponentCount();
    return needsOnboardingCoach(trackerStatus, trackerMatches, tagged);
  }, [trackerStatus, trackerMatches]);

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
  const heroArt = hero ? pickPreviewCards(hero)[0] : undefined;
  const heroVs = hero ? vsFor(hero) : undefined;

  return (
    <div className="flex flex-col gap-4">
      {/* D1 — activation strip on home until first-session loop is done */}
      {showOnboarding && (
        <div className="panel tracker-onboarding-home">
          <TrackerOnboarding showHealthDetail />
        </div>
      )}
      {/* D2 light — 2–3 catch-up chips when there's something to say */}
      <DailyDigestStrip formatId={activeFmt?.id} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow m-0 mb-1">Today’s lists · {meta.date}</p>
          <p className="text-sm text-muted m-0 max-w-2xl">
            Eight ranked decks per format — open any deck for the full list, curve, and
            one-click Arena import.
          </p>
        </div>
        <div className="format-switcher m-0" role="tablist" aria-label="Format">
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
      </div>

      <BanPulse />
      <SpoilerPulse />

      {activeFmt && hero && (
        <section className="daily-hero" aria-label="Deck to beat">
          {heroArt && (
            <div className="daily-hero-art" aria-hidden="true">
              <CardArt
                name={heroArt.name}
                scryfallId={heroArt.scryfallId}
                size="art_crop"
                rounded={false}
                className="daily-hero-img"
              />
            </div>
          )}
          <div className="daily-hero-scrim" aria-hidden="true" />
          <div className="daily-hero-body">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="daily-hero-kicker">Deck to beat</span>
                <span className="text-xs font-bold tracking-widest uppercase text-gold-400">
                  {activeFmt.name} · {mode.toUpperCase()}
                </span>
                <TierBadge tier={hero.tier} />
                <MovementChip move={movementByName.get(hero.name.toLowerCase())} />
                {hero.listQuality === "authoritative" && (
                  <span className="badge-verified">Verified list</span>
                )}
              </div>
              <h2 className="daily-hero-name">
                {hero.name}
                <ColorPips colors={hero.colors} />
              </h2>
              <p className="daily-hero-desc line-clamp-2">{hero.description}</p>
              <div className="flex flex-wrap gap-2 mt-3">
                <button
                  type="button"
                  className="btn btn-primary"
                  title={`Open full list for ${hero.name}`}
                  onClick={() => openDeck(hero.id)}
                >
                  Open deck
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  title={`Open ${activeFmt.name} format charts and stack`}
                  onClick={() => openFormat(activeFmt.id)}
                >
                  Format details
                </button>
              </div>
            </div>
            <div className="daily-hero-stats">
              {hero.metaShare != null && (
                <div
                  className="daily-hero-stat"
                  title={`Estimated share of the ${activeFmt.name} ${mode.toUpperCase()} board`}
                >
                  <strong>{hero.metaShare}%</strong>
                  <span>of the meta</span>
                </div>
              )}
              <div className="daily-hero-stat" title="Rank on today’s 8-deck board">
                <strong>#{hero.rank ?? 1}</strong>
                <span>today’s rank</span>
              </div>
              {heroVs && heroVs.wins + heroVs.losses > 0 && (
                <button
                  type="button"
                  className="daily-hero-stat daily-hero-stat-btn"
                  onClick={() => openMatchupTag(hero.archetype || hero.name)}
                  title="Open Matchup Lab for this tag"
                >
                  <strong
                    className={
                      heroVs.wins >= heroVs.losses ? "favor-favored" : "favor-unfavored"
                    }
                  >
                    {heroVs.wins}–{heroVs.losses}
                  </strong>
                  <span>you vs this deck</span>
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      <div className="filter-bar">
        <input
          type="search"
          placeholder="Search archetypes…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search decks"
          title="Search by deck name, archetype, or description"
        />
        {([0, 1, 2, 3] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={`filter-chip${filterTier === t ? " active" : ""}`}
            title={
              t === 0
                ? "Show all tiers"
                : `Only tier ${t} decks (T1 = highest meta presence)`
            }
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
            title={`Require ${c} in the deck’s colors — stack colors for exact pairings`}
          >
            {c}
          </button>
        ))}
      </div>

      {activeFmt && (
        <section>
          <h3 className="text-sm font-semibold text-muted uppercase tracking-wide m-0 mb-3">
            {activeFmt.name} · top {activeDecks.length} · {mode.toUpperCase()}
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
                  onOpenTag={(tag) => openMatchupTag(tag)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        <MetaShareTimeline />
        <PersonalMetaPanel />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        <OpponentArchetypePanel />
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
                    <button
                      key={n}
                      type="button"
                      className="diff-up mr-2 link-btn"
                      onClick={() => {
                        const d = Object.values(meta.decks).find(
                          (x) =>
                            x.name.toLowerCase() === n.toLowerCase() ||
                            x.archetype.toLowerCase() === n.toLowerCase(),
                        );
                        if (d) openDeck(d.id);
                      }}
                    >
                      ↑ {n}
                    </button>
                  ))}
                  {ch.fell.slice(0, 2).map((n) => (
                    <button
                      key={n}
                      type="button"
                      className="diff-down mr-2 link-btn"
                      onClick={() => {
                        const d = Object.values(meta.decks).find(
                          (x) =>
                            x.name.toLowerCase() === n.toLowerCase() ||
                            x.archetype.toLowerCase() === n.toLowerCase(),
                        );
                        if (d) openDeck(d.id);
                      }}
                    >
                      ↓ {n}
                    </button>
                  ))}
                  {ch.entered.slice(0, 2).map((n) => (
                    <button
                      key={n}
                      type="button"
                      className="diff-new mr-2 link-btn"
                      onClick={() => {
                        const d = Object.values(meta.decks).find(
                          (x) =>
                            x.name.toLowerCase() === n.toLowerCase() ||
                            x.archetype.toLowerCase() === n.toLowerCase(),
                        );
                        if (d) openDeck(d.id);
                      }}
                    >
                      + {n}
                    </button>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
