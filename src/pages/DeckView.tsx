import { useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { TierBadge } from "../components/TierBadge";
import { ColorPips } from "../components/ColorPips";
import { MatchupTable } from "../components/MatchupTable";
import { SideboardGuide } from "../components/SideboardGuide";
import { SourceFooter } from "../components/SourceFooter";
import { IconBack, IconCopy } from "../components/NavIcons";
import { copyToClipboard } from "../services/arenaImport";
import { scryfallImageUrl } from "../services/scryfall";

export function DeckView() {
  const meta = useAppStore((s) => s.meta);
  const deckId = useAppStore((s) => s.selectedDeckId);
  const setPage = useAppStore((s) => s.setPage);
  const openFormat = useAppStore((s) => s.openFormat);
  const [toast, setToast] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  const deck = deckId && meta ? meta.decks[deckId] : undefined;
  const fmt = deck ? meta?.formats.find((f) => f.id === deck.format) : undefined;

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
    deck.mainboard.find((c) => !/land|island|swamp|mountain|plains|forest/i.test(c.name))
      ?.name ??
    deck.mainboard[0]?.name;

  const onCopy = async () => {
    const ok = await copyToClipboard(deck.arenaImport);
    setToast(ok ? "Arena import copied" : "Copy failed — select text manually");
    setTimeout(() => setToast(null), 2200);
  };

  return (
    <div className="flex flex-col gap-5 max-w-5xl">
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
          <h2 className="text-2xl font-semibold m-0 tracking-tight">{deck.name}</h2>
          {deck.commander && (
            <p className="text-sm text-gold-300 mt-1 mb-0">Commander: {deck.commander}</p>
          )}
          <p className="text-sm text-muted mt-2 mb-0 max-w-2xl leading-relaxed">
            {deck.description}
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => void onCopy()}>
          <IconCopy className="w-4 h-4" /> Copy Arena import
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-4">
        <div className="flex flex-col gap-4">
          <section className="panel">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted m-0 mb-3">
              Mainboard ({deck.mainboard.reduce((n, c) => n + c.count, 0)})
            </h3>
            <div className="card-list selectable">
              {deck.mainboard.map((c) => (
                <div key={c.name} className="card-list-row">
                  <span className="count">{c.count}</span>
                  <span>{c.name}</span>
                </div>
              ))}
            </div>
          </section>

          {deck.sideboard.length > 0 && (
            <section className="panel">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted m-0 mb-3">
                Sideboard ({deck.sideboard.reduce((n, c) => n + c.count, 0)})
              </h3>
              <div className="card-list selectable">
                {deck.sideboard.map((c) => (
                  <div key={c.name} className="card-list-row">
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
          {previewCard && !imgError && (
            <div className="panel p-2 overflow-hidden">
              <img
                src={scryfallImageUrl(previewCard, "normal")}
                alt={previewCard}
                className="w-full rounded-lg"
                loading="lazy"
                onError={() => setImgError(true)}
              />
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

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
