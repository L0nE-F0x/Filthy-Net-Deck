import { useAppStore } from "../store/useAppStore";
import { BoModeToggle } from "../components/BoModeToggle";
import { TierBadge } from "../components/TierBadge";
import { ColorPips } from "../components/ColorPips";
import { decksForMode, topDeckForMode } from "../services/deckHelpers";
import type { Deck, FormatMeta } from "../types/meta";

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
  if (!decks.length) return null;
  return (
    <section className={compact ? "panel" : "panel panel-hero"}>
      <div className={`relative z-10 flex flex-wrap items-start justify-between gap-3 ${compact ? "mb-3" : "mb-4"}`}>
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
            <span className="text-xs text-muted">{mode.toUpperCase()} · 8 decks</span>
          </div>
          {!compact && (
            <p className="text-sm text-muted m-0 max-w-2xl leading-relaxed">{fmt.metaNotes}</p>
          )}
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenFormat}>
          Full format view
        </button>
      </div>
      <div className={`relative z-10 format-grid ${fmt.featured ? "" : ""}`}>
        {decks.map((d) => (
          <article
            key={d.id}
            className={`panel deck-card ${d.rank === 1 && fmt.featured ? "ring-1 ring-gold-500/30" : ""}`}
            style={compact ? { background: "var(--color-ink-900)" } : undefined}
            onClick={() => onOpenDeck(d.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onOpenDeck(d.id);
            }}
            role="button"
            tabIndex={0}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-gold-400">#{d.rank}</span>
              <TierBadge tier={d.tier} />
            </div>
            <h3 className="flex items-center gap-2 flex-wrap">
              {d.name}
              <ColorPips colors={d.colors} />
            </h3>
            <p className="line-clamp-2">
              {d.metaShare != null ? `${d.metaShare}% meta · ` : ""}
              {d.description}
            </p>
          </article>
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

  if (!meta) {
    return <div className="empty-state loading-pulse">Loading today’s meta…</div>;
  }

  const standard = meta.formats.find((f) => f.featured) ?? meta.formats[0];
  const rest = meta.formats.filter((f) => f.id !== standard?.id);
  const standardDecks = standard ? decksForMode(standard, mode, meta.decks) : [];
  const hero = standard ? topDeckForMode(standard, mode, meta.decks) : undefined;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Daily picks · {meta.date}</p>
          <p className="text-sm text-muted m-0 max-w-xl">
            <strong className="text-foam">8 full decklists × 8 formats</strong> every day. Open any
            rank for the complete list + Arena import. Standard first.
          </p>
        </div>
        <BoModeToggle mode={mode} onChange={setMode} />
      </div>

      {standard && hero && (
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
              <button type="button" className="btn btn-ghost" onClick={() => openFormat(standard.id)}>
                All 8 Standard decks
              </button>
            </div>
          </div>
          {standard.metaShareTop && standard.metaShareTop.length > 0 && (
            <div className="relative z-10 pt-4 border-t border-gold-500/15 grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {standard.metaShareTop.map((m) => (
                <div key={m.name}>
                  <div className="text-lg font-semibold text-gold-300">{m.pct}%</div>
                  <div className="text-xs text-muted">{m.name}</div>
                </div>
              ))}
            </div>
          )}
          <div className="relative z-10">
            <h3 className="text-sm font-semibold text-muted uppercase tracking-wide m-0 mb-3">
              Standard · full 8 ({mode.toUpperCase()})
            </h3>
            <div className="format-grid">
              {standardDecks.map((d) => (
                <article
                  key={d.id}
                  className="panel deck-card"
                  style={{ background: "color-mix(in srgb, var(--color-ink-900) 80%, transparent)" }}
                  onClick={() => openDeck(d.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") openDeck(d.id);
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-gold-400">#{d.rank}</span>
                    <TierBadge tier={d.tier} />
                  </div>
                  <h3 className="flex items-center gap-2 flex-wrap">
                    {d.name}
                    <ColorPips colors={d.colors} />
                  </h3>
                  <p className="line-clamp-2">
                    {d.metaShare != null ? `${d.metaShare}% · ` : ""}
                    {d.archetype}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {rest.map((fmt) => (
        <FormatDeckStrip
          key={fmt.id}
          fmt={fmt}
          decks={decksForMode(fmt, mode, meta.decks)}
          mode={mode}
          compact
          onOpenDeck={openDeck}
          onOpenFormat={() => openFormat(fmt.id)}
        />
      ))}
    </div>
  );
}
