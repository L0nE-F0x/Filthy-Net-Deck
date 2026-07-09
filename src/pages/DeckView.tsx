import { useEffect, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { TierBadge } from "../components/TierBadge";
import { ColorPips } from "../components/ColorPips";
import { MatchupTable } from "../components/MatchupTable";
import { SideboardGuide } from "../components/SideboardGuide";
import { SourceFooter } from "../components/SourceFooter";
import { ManaCurve, ColorPie } from "../components/ManaCurve";
import { IconBack, IconCopy, IconStar } from "../components/NavIcons";
import { copyToClipboard } from "../services/arenaImport";
import { validateDeckNames } from "../services/scryfallValidate";
import { CardArt, CardArtStrip, pickPreviewCards } from "../components/CardArt";

export function DeckView() {
  const meta = useAppStore((s) => s.meta);
  const deckId = useAppStore((s) => s.selectedDeckId);
  const setPage = useAppStore((s) => s.setPage);
  const openFormat = useAppStore((s) => s.openFormat);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  const favorites = useAppStore((s) => s.favorites);
  const [toast, setToast] = useState<string | null>(null);
  const [unknown, setUnknown] = useState<string[]>([]);
  const [qaLoading, setQaLoading] = useState(false);

  const deck = deckId && meta ? meta.decks[deckId] : undefined;
  const fmt = deck ? meta?.formats.find((f) => f.id === deck.format) : undefined;
  const fav = deck ? favorites.includes(deck.id) : false;

  useEffect(() => {
    setUnknown([]);
    if (!deck) return;
    let cancelled = false;
    setQaLoading(true);
    const names = [
      ...deck.mainboard.map((c) => c.name),
      ...deck.sideboard.map((c) => c.name),
      ...(deck.commander ? [deck.commander] : []),
    ];
    void validateDeckNames(names).then((r) => {
      if (!cancelled) {
        setUnknown(r.unknown);
        setQaLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [deck?.id]);

  if (!deck) {
    return (
      <div className="empty-state">
        <p>Deck not found.</p>
        <button type="button" className="btn btn-ghost" onClick={() => setPage("daily")}>
          Back to Daily
        </button>
      </div>
    );
  }

  const previewCard =
    deck.commander ??
    deck.mainboard.find((c) => !/^(Plains|Island|Swamp|Mountain|Forest)/i.test(c.name))?.name ??
    deck.mainboard[0]?.name;

  const mainCount = deck.mainboard.reduce((n, c) => n + c.count, 0);
  const sbCount = deck.sideboard.reduce((n, c) => n + c.count, 0);
  const unknownSet = new Set(unknown.map((n) => n.toLowerCase()));

  const onCopy = async () => {
    const ok = await copyToClipboard(deck.arenaImport);
    setToast(ok ? "Arena import copied" : "Copy failed — select text manually");
    setTimeout(() => setToast(null), 2200);
  };

  return (
    <div className="flex flex-col gap-4 max-w-5xl pb-16">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap gap-2 mb-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPage("daily")}>
              <IconBack className="w-4 h-4" /> Daily
            </button>
            {fmt && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => openFormat(fmt.id)}
              >
                {fmt.name}
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wide text-azure-300">
              {fmt?.name ?? deck.format} · {deck.mode.toUpperCase()}
              {deck.rank != null ? ` · #${deck.rank}` : ""}
            </span>
            <TierBadge tier={deck.tier} />
            <ColorPips colors={deck.colors} />
            {deck.metaShare != null && (
              <span className="text-xs text-muted">{deck.metaShare}% meta</span>
            )}
          </div>
          <h2 className="text-2xl font-semibold m-0 tracking-tight flex items-center gap-2">
            {deck.name}
            <button
              type="button"
              className={`star-btn${fav ? " on" : ""}`}
              onClick={() => toggleFavorite(deck.id)}
              aria-label={fav ? "Unstar" : "Star"}
            >
              <IconStar className="w-5 h-5" filled={fav} />
            </button>
          </h2>
          {deck.commander && (
            <p className="text-sm text-gold-300 mt-1 mb-0">Commander: {deck.commander}</p>
          )}
          <p className="text-sm text-muted mt-2 mb-0 max-w-2xl leading-relaxed">
            {deck.description}
          </p>
          <div className="mt-3">
            <CardArtStrip names={pickPreviewCards(deck.mainboard, deck.commander)} max={6} />
          </div>
        </div>
      </div>

      {qaLoading && (
        <div className="text-xs text-muted">Checking card names on Scryfall…</div>
      )}
      {unknown.length > 0 && (
        <div className="qa-flag">
          <strong>Decklist QA:</strong> {unknown.length} name(s) not found on Scryfall (may be
          Arena-only, new set, or typo): {unknown.slice(0, 8).join(", ")}
          {unknown.length > 8 ? "…" : ""}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-4">
        <div className="flex flex-col gap-4">
          <section className="panel">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted m-0">
                Mana curve & colors
              </h3>
              <ColorPie colors={deck.colors} />
            </div>
            <ManaCurve cards={deck.mainboard} />
          </section>

          <section className="panel">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted m-0 mb-3">
              Mainboard ({mainCount})
            </h3>
            <div className="card-list selectable">
              {deck.mainboard.map((c) => (
                <div
                  key={c.name}
                  className={`card-list-row${unknownSet.has(c.name.toLowerCase()) ? " card-unknown" : ""}`}
                >
                  <span className="count">{c.count}</span>
                  <span>{c.name}</span>
                  {unknownSet.has(c.name.toLowerCase()) && (
                    <span className="text-[10px] text-poor ml-auto">?</span>
                  )}
                </div>
              ))}
            </div>
          </section>

          {deck.sideboard.length > 0 && (
            <section className="panel">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted m-0 mb-3">
                Sideboard ({sbCount})
              </h3>
              <div className="card-list selectable">
                {deck.sideboard.map((c) => (
                  <div
                    key={c.name}
                    className={`card-list-row${unknownSet.has(c.name.toLowerCase()) ? " card-unknown" : ""}`}
                  >
                    <span className="count">{c.count}</span>
                    <span>{c.name}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="panel">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted m-0 mb-3">
              Matchups
            </h3>
            <MatchupTable matchups={deck.matchups} />
          </section>

          <section className="panel">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted m-0 mb-3">
              Sideboard guide
            </h3>
            <SideboardGuide guide={deck.sideboardGuide} />
            <SourceFooter sources={deck.sources} />
          </section>
        </div>

        <aside className="flex flex-col gap-3">
          {previewCard && (
            <div className="panel p-2 overflow-hidden">
              <CardArt name={previewCard} size="normal" className="w-full card-art-large" />
              <p className="text-[11px] text-muted text-center m-0 mt-2">{previewCard}</p>
            </div>
          )}
          <div className="panel">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted m-0 mb-2">
              Arena import
            </h4>
            <pre className="selectable text-[11px] leading-relaxed m-0 p-2 rounded-lg bg-ink-950/80 border border-ink-700/50 overflow-auto max-h-64 whitespace-pre-wrap font-mono text-muted">
              {deck.arenaImport}
            </pre>
          </div>
        </aside>
      </div>

      <div className="sticky-import">
        <div className="text-sm">
          <strong className="text-foam">{deck.name}</strong>
          <span className="text-muted text-xs ml-2">
            {mainCount} main{sbCount ? ` · ${sbCount} SB` : ""} · {deck.mode.toUpperCase()}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className={`btn btn-ghost btn-sm star-btn${fav ? " on" : ""}`}
            onClick={() => toggleFavorite(deck.id)}
          >
            <IconStar className="w-4 h-4" filled={fav} /> Queue
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void onCopy()}>
            <IconCopy className="w-4 h-4" /> Copy Arena import
          </button>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
