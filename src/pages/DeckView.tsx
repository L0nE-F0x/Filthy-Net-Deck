import { useEffect, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { TierBadge } from "../components/TierBadge";
import { ColorPips } from "../components/ColorPips";
import { MatchupTable } from "../components/MatchupTable";
import { SideboardGuide } from "../components/SideboardGuide";
import { SourceFooter } from "../components/SourceFooter";
import { ManaCurve, ColorPie } from "../components/ManaCurve";
import { IconBack, IconCopy } from "../components/NavIcons";
import { copyToClipboard } from "../services/arenaImport";
import { validateDeckNames } from "../services/scryfallValidate";
import { CardArt, CardArtStrip, pickPreviewCards } from "../components/CardArt";

export function DeckView() {
  const meta = useAppStore((s) => s.meta);
  const deckId = useAppStore((s) => s.selectedDeckId);
  const setPage = useAppStore((s) => s.setPage);
  const openFormat = useAppStore((s) => s.openFormat);
  const [toast, setToast] = useState<string | null>(null);
  const [unknown, setUnknown] = useState<string[]>([]);
  const [qaLoading, setQaLoading] = useState(false);

  const deck = deckId && meta ? meta.decks[deckId] : undefined;
  const fmt = deck ? meta?.formats.find((f) => f.id === deck.format) : undefined;

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
          Back to Decks
        </button>
      </div>
    );
  }

  const previewCards = pickPreviewCards(deck);
  const previewCard = previewCards[0];

  const mainCount = deck.mainboard.reduce((n, c) => n + c.count, 0);
  const sbCount = deck.sideboard.reduce((n, c) => n + c.count, 0);
  const unknownSet = new Set(unknown.map((n) => n.toLowerCase()));

  const onCopy = async () => {
    const ok = await copyToClipboard(deck.arenaImport);
    setToast(ok ? "Arena import copied" : "Copy failed — select text manually");
    setTimeout(() => setToast(null), 2200);
  };

  return (
    <div className="flex flex-col gap-4 max-w-5xl pb-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap gap-2 mb-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPage("daily")}>
              <IconBack className="w-4 h-4" /> Decks
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
          <h2 className="text-2xl font-semibold m-0 tracking-tight">{deck.name}</h2>
          {deck.commander && (
            <p className="text-sm text-gold-300 mt-1 mb-0">Commander: {deck.commander}</p>
          )}
          <p className="text-sm text-muted mt-2 mb-0 max-w-2xl leading-relaxed">
            {deck.description}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 items-center">
            <span
              className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${
                deck.listQuality === "authoritative"
                  ? "border-good/40 text-good bg-good/10"
                  : deck.listQuality === "partial"
                    ? "border-fair/40 text-fair bg-fair/10"
                    : "border-muted/40 text-muted bg-ink-800"
              }`}
            >
              {deck.listQuality === "authoritative"
                ? "Verified list"
                : deck.listQuality === "partial"
                  ? "Partial list"
                  : "Offline / last-known list"}
            </span>
            {deck.listNote && (
              <span className="text-[11px] text-muted">{deck.listNote}</span>
            )}
          </div>
          <div className="mt-3">
            <CardArtStrip cards={previewCards} max={6} />
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

          {deck.matchups.length > 0 && (
            <section className="panel">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted m-0 mb-3">
                Matchups
              </h3>
              <MatchupTable matchups={deck.matchups} />
            </section>
          )}

          {deck.sideboardGuide.length > 0 && (
            <section className="panel">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted m-0 mb-3">
                Sideboard guide
              </h3>
              <SideboardGuide guide={deck.sideboardGuide} />
            </section>
          )}

          <section className="panel">
            <SourceFooter sources={deck.sources} />
          </section>
        </div>

        <aside className="flex flex-col gap-3">
          {previewCard && (
            <div className="panel p-2 overflow-hidden">
              <CardArt
                name={previewCard.name}
                scryfallId={previewCard.scryfallId}
                size="normal"
                className="w-full card-art-large"
              />
              <p className="text-[11px] text-muted text-center m-0 mt-2">{previewCard.name}</p>
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

      <div className="deck-import-bar">
        <div className="text-sm">
          <strong className="text-foam">{deck.name}</strong>
          <span className="text-muted text-xs ml-2">
            {mainCount} main{sbCount ? ` · ${sbCount} SB` : ""} · {deck.mode.toUpperCase()}
          </span>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void onCopy()}>
            <IconCopy className="w-4 h-4" /> Copy Arena import
          </button>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
