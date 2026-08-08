import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { inferenceCandidates } from "../services/deckHelpers";
import {
  inferOpponentArchetype,
  normalizeCardName,
  selectOpponentSeenGrpIds,
  type SeenScope,
} from "../services/opponentArchetype";
import {
  peekArenaMeta,
  peekSeenCard,
  resolveArenaMetaBatch,
} from "../services/arenaMeta";
import { buildArenaImport, copyToClipboard } from "../services/arenaImport";
import type { Deck, FormatId, PlayMode } from "../types/meta";
import type { OppGroup } from "../services/matchupGroups";

/** Front-face import text for the closest ranked list. */
function importFor(deck: Deck): string {
  return buildArenaImport({
    mainboard: deck.mainboard,
    sideboard: deck.sideboard ?? [],
    commander: deck.commander,
  });
}

const COLOR_NAME: Record<string, string> = {
  W: "white",
  U: "blue",
  B: "black",
  R: "red",
  G: "green",
};

function listColors(colors: string[]): string {
  const names = colors.map((c) => COLOR_NAME[c] ?? c);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

interface RevealedCard {
  id: number;
  name: string;
  art: string | null;
  isLand: boolean;
  /** A signature card that drove the archetype guess. */
  isHit: boolean;
}

/**
 * "What they were playing" — infers the closest meta list from the cards the
 * tracker saw the opponent play (ranked boards + off-meta recognition decks),
 * shows that evidence, and lets you copy the list (Arena import) or send it to
 * Brew Lab to improve on. When no list matches, a generic color/strategy label
 * ("Gruul Midrange") is shown instead — we never claim it's their exact 75.
 */
export function OpponentDeckRead({ group }: { group: OppGroup }) {
  const meta = useAppStore((s) => s.meta);
  const dailyFormatId = useAppStore((s) => s.dailyFormatId);
  const openDeck = useAppStore((s) => s.openDeck);
  const openBrewLabText = useAppStore((s) => s.openBrewLabText);

  const [scope, setScope] = useState<SeenScope>("recent");
  const [copied, setCopied] = useState(false);

  const selection = useMemo(
    () => selectOpponentSeenGrpIds(group.matches, scope),
    [group.matches, scope],
  );

  const fmt =
    meta?.formats.find((f) => f.id === (dailyFormatId as FormatId)) ??
    meta?.formats.find((f) => f.featured) ??
    meta?.formats[0];

  // Bo1 and Bo3 fields differ — pick lists matching the source match's format.
  const mode: PlayMode = (selection.sourceBestOf ?? 1) >= 3 ? "bo3" : "bo1";

  const candidates = useMemo(() => {
    if (!meta || !fmt) return [];
    // Both Bo1/Bo3 lists so Lessons twins stay distinguishable.
    return inferenceCandidates(meta.decks, { format: fmt, mode });
  }, [meta, fmt, mode]);

  // Resolve grpId → card name/art (cached; network only for new ids).
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!selection.grpIds.length) return;
    let cancelled = false;
    void resolveArenaMetaBatch(selection.grpIds).then(() => {
      if (!cancelled) setTick((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [selection.grpIds]);

  const resolveName = useMemo(() => {
    void tick; // re-bind once the batch resolves
    return (grpId: number) => peekSeenCard(grpId);
  }, [tick]);

  const guess = useMemo(() => {
    if (!candidates.length || !selection.grpIds.length) return null;
    return inferOpponentArchetype(selection.grpIds, resolveName, candidates, {
      minHits: 2,
      minConfidence: 0.3,
    });
  }, [candidates, selection.grpIds, resolveName]);

  const revealed: RevealedCard[] = useMemo(() => {
    void tick;
    const hits = new Set((guess?.hits ?? []).map((h) => normalizeCardName(h)));
    return selection.grpIds
      .map((id): RevealedCard | null => {
        const m = peekArenaMeta(id);
        if (!m) return null;
        return {
          id,
          name: m.name,
          art: m.artUrl,
          isLand: m.isLand,
          isHit: hits.has(normalizeCardName(m.name)),
        };
      })
      .filter((x): x is RevealedCard => x != null)
      // Signature hits first, then spells, then lands.
      .sort(
        (a, b) =>
          Number(b.isHit) - Number(a.isHit) ||
          Number(a.isLand) - Number(b.isLand) ||
          a.name.localeCompare(b.name),
      );
  }, [selection.grpIds, guess, tick]);

  if (!meta || !fmt) return null;

  const guessDeck = guess ? (meta.decks[guess.deckId] ?? null) : null;
  const pct = guess ? Math.round(guess.confidence * 100) : 0;
  // Proven colors the closest ranked list cannot cast.
  const offColors = (guess?.observedColors ?? []).filter(
    (c) => !(guessDeck?.colors ?? []).includes(c),
  );
  const unresolved = revealed.length < selection.grpIds.length;

  const onCopy = async () => {
    if (!guessDeck) return;
    const ok = await copyToClipboard(importFor(guessDeck));
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <section className="opp-read mt-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="dash-title m-0">What they were playing</h4>
        {selection.seenMatchCount > 1 && (
          <div className="opp-read-scope" role="group" aria-label="Cards to read from">
            <button
              type="button"
              className={`filter-chip${scope === "recent" ? " active" : ""}`}
              title="Only the most recent match that revealed cards"
              onClick={() => setScope("recent")}
            >
              Last match
            </button>
            <button
              type="button"
              className={`filter-chip${scope === "all" ? " active" : ""}`}
              title="Every card seen across all matches vs this opponent"
              onClick={() => setScope("all")}
            >
              All {selection.seenMatchCount} seen
            </button>
          </div>
        )}
      </div>

      {selection.grpIds.length === 0 ? (
        <p className="text-xs text-muted m-0 mt-1 leading-relaxed">
          No opponent cards recorded yet. Play with Arena&apos;s Detailed Logs on — cards they cast
          or put into play are captured automatically (nothing leaves your PC).
        </p>
      ) : (
        <>
          {guess && guess.macroFallback ? (
            <>
              <p className="text-sm m-0 mt-1">
                Off-meta read: <span className="font-semibold">{guess.archetype}</span>{" "}
                <span
                  className="opp-read-conf"
                  title={`No meta list matched — generic color/strategy read from their revealed cards · ${fmt.name} ${mode.toUpperCase()}`}
                >
                  ~{pct}% match
                </span>
              </p>
              <p className="text-[11px] text-muted m-0 mt-1 leading-relaxed">
                No meta list shares enough of their cards — this label comes from their
                curve, card types and colors, not a tracked deck.
              </p>
            </>
          ) : guess && guessDeck ? (
            <>
              <p className="text-sm m-0 mt-1">
                {guess.colorAdjusted ? "They were on: " : "Closest ranked list: "}
                <button
                  type="button"
                  className="link-btn font-semibold"
                  onClick={() => openDeck(guess.deckId)}
                  title={
                    guess.colorAdjusted
                      ? `Closest ranked list is ${guess.baseArchetype} — open it`
                      : "Open the full ranked list"
                  }
                >
                  {guess.archetype}
                </button>{" "}
                <span
                  className="opp-read-conf"
                  title={`${guess.distinctiveHits} signature card${guess.distinctiveHits === 1 ? "" : "s"} matched · ${fmt.name} ${mode.toUpperCase()}`}
                >
                  ~{pct}% match
                </span>
              </p>
              {guess.colorAdjusted && offColors.length > 0 && (
                <p className="text-[11px] text-muted m-0 mt-1 leading-relaxed">
                  Cards match {guess.baseArchetype}, but they also played{" "}
                  {listColors(offColors)} mana — so this isn&apos;t the stock list.
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-muted m-0 mt-1 leading-relaxed">
              {revealed.length} card{revealed.length === 1 ? "" : "s"} seen, but not enough
              signature cards to call the archetype yet
              {unresolved ? " (some still resolving)" : ""}. Keep playing — a couple of unique cards
              usually unlock it.
            </p>
          )}

          <div className="opp-read-cards" aria-label="Cards the opponent revealed">
            {revealed.map((c) => (
              <span
                key={c.id}
                className={`opp-read-chip${c.isHit ? " is-hit" : ""}${c.isLand ? " is-land" : ""}`}
                title={c.isHit ? `${c.name} — signature card for this archetype` : c.name}
              >
                {c.art ? <img src={c.art} alt="" loading="lazy" /> : null}
                <span className="opp-read-chip-name">{c.name}</span>
              </span>
            ))}
            {unresolved && (
              <span className="opp-read-chip is-pending" title="Resolving card names…">
                <span className="opp-read-chip-name">
                  +{selection.grpIds.length - revealed.length} resolving…
                </span>
              </span>
            )}
          </div>

          {guessDeck && (
            <div className="flex items-center gap-2 flex-wrap mt-2">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => void onCopy()}
                title="Copy the closest ranked list as Arena import text (Decks → Import Deck)"
              >
                {copied ? "Copied ✓" : "Copy their deck"}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => openBrewLabText(importFor(guessDeck))}
                title="Send this list to Brew Lab to grade and improve it"
              >
                Improve in Brew Lab
              </button>
              <span className="text-[11px] text-muted">
                Closest ranked list — not their exact 75.
              </span>
            </div>
          )}
        </>
      )}
    </section>
  );
}
