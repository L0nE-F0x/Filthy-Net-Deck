import { useEffect, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { TierBadge } from "../components/TierBadge";
import { ColorPips } from "../components/ColorPips";
import { MatchupTable } from "../components/MatchupTable";
import { SideboardGuide } from "../components/SideboardGuide";
import { SourceFooter } from "../components/SourceFooter";
import { ManaCurve, ColorPie } from "../components/ManaCurve";
import { IconBack, IconCopy } from "../components/NavIcons";
import { buildArenaImport, copyToClipboard, sanitizeArenaImportText } from "../services/arenaImport";
import { validateDeckNames } from "../services/scryfallValidate";
import { scryfallCdnUrl } from "../services/scryfall";
import { CardArt, CardArtStrip, pickPreviewCards } from "../components/CardArt";
import { ArchetypeDiffPanel } from "../components/ArchetypeDiffPanel";
import { deckRotationImpact, rotationWhen } from "../services/rotationImpact";
import { recordVsArchetypeTag } from "../services/statsInsights";
import { loadAllOpponentNotes } from "../services/matchupNotes";
import { TrackerOnboarding } from "../components/TrackerOnboarding";
import type { CardEntry } from "../types/meta";

/** One decklist row with a card-art popup on hover (when the id is known). */
function CardRow({
  c,
  unknown,
  rotating,
}: {
  c: CardEntry;
  unknown: boolean;
  rotating?: boolean;
}) {
  return (
    <div className={`card-list-row card-row-hover${unknown ? " card-unknown" : ""}`}>
      <span className="count">{c.count}</span>
      <span>{c.name}</span>
      {rotating && (
        <span className="card-rotating" title="Rotates out of Standard at the next rotation">
          ⟳
        </span>
      )}
      {unknown && <span className="text-[10px] text-poor ml-auto">?</span>}
      {c.scryfallId ? (
        <span className="card-hover-pop" aria-hidden="true">
          <img src={scryfallCdnUrl(c.scryfallId, "normal")} alt="" loading="lazy" />
        </span>
      ) : null}
    </div>
  );
}

const TYPE_GROUPS: { key: string; label: string }[] = [
  { key: "creature", label: "Creatures" },
  { key: "planeswalker", label: "Planeswalkers" },
  { key: "instant", label: "Instants" },
  { key: "sorcery", label: "Sorceries" },
  { key: "enchantment", label: "Enchantments" },
  { key: "artifact", label: "Artifacts" },
  { key: "battle", label: "Battles" },
  { key: "other", label: "Other" },
  { key: "land", label: "Lands" },
];

/**
 * Group the mainboard the way deck sites do. Newer feeds embed a type bucket;
 * older ones only flag lands (Spells/Lands split); oldest get one flat list.
 */
function groupMainboard(
  cards: CardEntry[],
): { label: string; cards: CardEntry[]; count: number }[] {
  const sortGroup = (list: CardEntry[]) =>
    [...list].sort((a, b) => (a.cmc ?? 99) - (b.cmc ?? 99) || a.name.localeCompare(b.name));
  const total = (list: CardEntry[]) => list.reduce((n, c) => n + c.count, 0);

  const hasTypeInfo = cards.some((c) => c.type);
  const hasLandInfo = cards.some((c) => c.land);
  if (!hasTypeInfo && !hasLandInfo) {
    return [{ label: "", cards, count: total(cards) }];
  }
  if (!hasTypeInfo) {
    const lands = cards.filter((c) => c.land);
    const spells = cards.filter((c) => !c.land);
    return [
      { label: "Spells", cards: sortGroup(spells), count: total(spells) },
      { label: "Lands", cards: sortGroup(lands), count: total(lands) },
    ].filter((g) => g.cards.length > 0);
  }
  const byKey = new Map<string, CardEntry[]>();
  for (const c of cards) {
    const key = c.land ? "land" : (c.type ?? "other");
    const list = byKey.get(key) ?? [];
    list.push(c);
    byKey.set(key, list);
  }
  return TYPE_GROUPS.filter((g) => byKey.has(g.key)).map((g) => {
    const list = byKey.get(g.key)!;
    return { label: g.label, cards: sortGroup(list), count: total(list) };
  });
}

/** Weighted average mana value of nonland mainboard cards. */
function averageManaValue(cards: CardEntry[]): number | null {
  let sum = 0;
  let n = 0;
  for (const c of cards) {
    if (c.land || c.cmc == null) continue;
    sum += c.cmc * c.count;
    n += c.count;
  }
  return n > 0 ? sum / n : null;
}

export function DeckView() {
  const meta = useAppStore((s) => s.meta);
  const sets = useAppStore((s) => s.sets);
  const deckId = useAppStore((s) => s.selectedDeckId);
  const setPage = useAppStore((s) => s.setPage);
  const openFormat = useAppStore((s) => s.openFormat);
  const openMatchupTag = useAppStore((s) => s.openMatchupTag);
  const trackerMatches = useAppStore((s) => s.trackerMatches);
  const trackerStatus = useAppStore((s) => s.trackerStatus);
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
  const mainGroups = groupMainboard(deck.mainboard);
  const avgMv = averageManaValue(deck.mainboard);
  const rotation = deckRotationImpact(deck, sets?.formats?.standard?.rotation);
  const rotatingNames = new Set(
    (rotation?.hits ?? []).map((h) => h.name.toLowerCase()),
  );

  // D3: real tagged record vs this archetype (Matchup Lab tags only)
  const yourRecord = recordVsArchetypeTag(
    trackerMatches,
    (deck.archetype || deck.name).trim(),
    loadAllOpponentNotes(),
    (n) => (n ?? "").trim().toLowerCase() || "unknown",
  );

  // Always rebuild (or sanitize) so "Front // Back" names never hit Arena's importer.
  const arenaText = sanitizeArenaImportText(
    buildArenaImport({
      mainboard: deck.mainboard,
      sideboard: deck.sideboard,
      commander: deck.commander,
    }),
  );

  const onCopy = async () => {
    const ok = await copyToClipboard(arenaText);
    setToast(
      ok
        ? "Copied! In Arena: Decks → Import Deck"
        : "Copy failed — select text manually",
    );
    setTimeout(() => setToast(null), 3200);
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

      {rotation && rotation.distinct > 0 && (
        <div className="rotation-flag">
          <div className="rotation-flag-head">
            <span className="rotation-flag-badge">Rotation</span>
            <strong>
              Loses {rotation.distinct} card{rotation.distinct === 1 ? "" : "s"} (
              {rotation.mainCopies} main
              {rotation.sideCopies > 0 ? ` · ${rotation.sideCopies} SB` : ""}) at{" "}
              {rotationWhen(rotation)}
            </strong>
          </div>
          <p className="rotation-flag-cards">
            {rotation.hits
              .filter((h) => h.board === "main")
              .map((h) => `${h.count} ${h.name}`)
              .join(" · ")}
            {rotation.hits.some((h) => h.board === "side") && (
              <>
                {" "}
                <span className="text-muted">
                  · SB:{" "}
                  {rotation.hits
                    .filter((h) => h.board === "side")
                    .map((h) => `${h.count} ${h.name}`)
                    .join(", ")}
                </span>
              </>
            )}
          </p>
        </div>
      )}

      <ArchetypeDiffPanel deck={deck} />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-4">
        <div className="flex flex-col gap-4">
          <section className="panel">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted m-0">
                Mana curve & colors
                {avgMv != null && (
                  <span className="text-gold-300 normal-case tracking-normal">
                    {" "}
                    · avg MV {avgMv.toFixed(2)}
                  </span>
                )}
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
              {mainGroups.map((g) => (
                <div key={g.label || "all"}>
                  {g.label && (
                    <p className="card-group-head">
                      {g.label} <span className="text-muted">({g.count})</span>
                    </p>
                  )}
                  {g.cards.map((c) => (
                    <CardRow
                      key={c.name}
                      c={c}
                      unknown={unknownSet.has(c.name.toLowerCase())}
                      rotating={rotatingNames.has(c.name.toLowerCase())}
                    />
                  ))}
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
                  <CardRow
                    key={c.name}
                    c={c}
                    unknown={unknownSet.has(c.name.toLowerCase())}
                    rotating={rotatingNames.has(c.name.toLowerCase())}
                  />
                ))}
              </div>
            </section>
          )}

          <section className="panel">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted m-0 mb-2">
              Your record
            </h3>
            {yourRecord.wins + yourRecord.losses > 0 ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm m-0">
                  vs opponents tagged{" "}
                  <strong className="text-foam">{deck.archetype || deck.name}</strong>:{" "}
                  <strong>
                    {yourRecord.wins}–{yourRecord.losses}
                  </strong>
                  {yourRecord.rate != null && (
                    <span className="text-muted">
                      {" "}
                      ({Math.round(yourRecord.rate * 100)}%)
                    </span>
                  )}
                </p>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => openMatchupTag(deck.archetype || deck.name)}
                >
                  Matchup Lab →
                </button>
              </div>
            ) : trackerMatches.length === 0 && trackerStatus ? (
              // No tracked matches yet on the desktop app — coach the first-run
              // loop (log → first match → first tag) instead of the tag copy.
              <TrackerOnboarding compact showHealthDetail={false} />
            ) : (
              <p className="text-xs text-muted m-0 leading-relaxed">
                No tagged games yet against this archetype. In Matchup Lab, tag opponents with
                &quot;{deck.archetype || deck.name}&quot; after you play them — records stay on
                this PC.
              </p>
            )}
          </section>

          {deck.matchups.length > 0 && (
            <section className="panel">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted m-0 mb-3">
                Published matchups
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
              {arenaText}
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

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
