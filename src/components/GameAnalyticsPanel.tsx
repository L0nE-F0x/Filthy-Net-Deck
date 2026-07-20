import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { peekArenaMeta, resolveArenaMetaBatch } from "../services/arenaMeta";
import { deckMatchupMatrix, pct, pts, sideboardSplit } from "../services/gameAnalytics";
import type { TrackedMatch } from "../types/tracker";
import type { Deck } from "../types/meta";
import { ShareMenu } from "./ShareMenu";
import {
  communityShareOptions,
  deliverShare,
  metaWebDeckUrl,
  type ShareDestination,
} from "../services/communityShare";
import {
  matchupShareCaption,
  matchupShareFilename,
  packageMatchupShare,
  renderMatchupSharePng,
} from "../services/matchupShare";

/**
 * B2 — game-level analytics for one tracked deck (Stats deck detail).
 * Bo3 pre/post-board delta and the personal matchup table vs B1-inferred
 * opponent archetypes. (Game-level play/draw lives in SplitsPanel.) All
 * local, all real; games without recorded facts are excluded, never
 * estimated.
 */
export function GameAnalyticsPanel({
  deckMatches,
  deckName,
}: {
  deckMatches: TrackedMatch[];
  /** Display name for the share card (tracked deck name). */
  deckName?: string;
}) {
  const meta = useAppStore((s) => s.meta);
  const openDeck = useAppStore((s) => s.openDeck);

  // Candidates: today's ranked lists across both formats (a tracked deck's
  // format isn't stored). Bo3 variants only — same mainboards as Bo1, no dupes.
  const candidates = useMemo(() => {
    if (!meta) return [] as Deck[];
    const out: Deck[] = [];
    for (const fmt of meta.formats) {
      for (const id of fmt.bo3DeckIds ?? []) {
        const d = meta.decks[id];
        if (d) out.push(d);
      }
    }
    return out;
  }, [meta]);

  const allIds = useMemo(() => {
    const s = new Set<number>();
    for (const m of deckMatches) {
      for (const id of m.opponentSeen ?? []) s.add(id);
    }
    return [...s];
  }, [deckMatches]);

  const [resolvedTick, setResolvedTick] = useState(0);
  useEffect(() => {
    if (allIds.length === 0) return;
    let cancelled = false;
    void resolveArenaMetaBatch(allIds).then(() => {
      if (!cancelled) setResolvedTick((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [allIds]);

  const resolveName = useMemo(() => {
    void resolvedTick; // re-bind when the batch lands
    return (grpId: number) => peekArenaMeta(grpId)?.name ?? null;
  }, [resolvedTick]);

  const side = useMemo(() => sideboardSplit(deckMatches), [deckMatches]);
  const matchups = useMemo(
    () =>
      deckMatchupMatrix(deckMatches, resolveName, candidates, {
        minHits: 2,
        minConfidence: 0.3,
      }),
    [deckMatches, resolveName, candidates],
  );

  const hasSide = side.matchesConsidered > 0;
  const seenMatches = deckMatches.filter(
    (m) => (m.opponentSeen?.length ?? 0) > 0,
  ).length;

  if (!hasSide && matchups.length === 0 && seenMatches === 0) {
    return null; // nothing recorded at game granularity yet — stay quiet
  }

  const shareName =
    deckName?.trim() ||
    deckMatches.find((m) => m.deckName?.trim())?.deckName?.trim() ||
    "My deck";

  return (
    <section className="panel">
      <div className="flex items-start justify-between gap-2 flex-wrap mb-1">
        <div>
          <p className="eyebrow m-0 mb-1">Game analytics</p>
          <h3 className="text-sm font-semibold m-0 mb-0">
            Sideboard & matchups
            <span className="text-muted font-normal"> · decided games only, from your log</span>
          </h3>
        </div>
        {matchups.length > 0 && (
          <ShareMenu
            label="Share matchups"
            hint="Personal WR by inferred archetype — save, Discord, or X"
            options={communityShareOptions("seeds public meta link when known")}
            onPick={async (id) => {
              const dest = id as ShareDestination;
              const overallWins = deckMatches.filter((m) => m.result === "win").length;
              const overallLosses = deckMatches.filter((m) => m.result === "loss").length;
              const packed = packageMatchupShare(shareName, matchups, {
                overall: { wins: overallWins, losses: overallLosses },
              });
              if (!packed) throw new Error("No matchup rows to share yet");
              const blob = await renderMatchupSharePng(packed);
              const caption = matchupShareCaption(packed, metaWebDeckUrl);
              const result = await deliverShare({
                destination: dest,
                blob,
                filename: matchupShareFilename(shareName),
                caption,
              });
              if (!result.ok) throw new Error(result.message);
              return result.message;
            }}
          />
        )}
      </div>

      {hasSide && (
        <div className="mb-3 text-xs">
          <p className="text-muted m-0 mb-0.5">Bo3: game 1 vs post-board</p>
          <p className="m-0 font-semibold">
            {pct(side.g1.rate)}{" "}
            <span className="text-muted font-normal">({side.g1.games}g)</span>
            {" → "}
            {pct(side.post.rate)}{" "}
            <span className="text-muted font-normal">({side.post.games}g)</span>
            {side.delta != null && (
              <span className="text-muted font-normal"> · {pts(side.delta)} after siding</span>
            )}
          </p>
        </div>
      )}

      {matchups.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted text-left">
                <th className="py-1 pr-2 font-medium">Vs archetype</th>
                <th className="py-1 pr-2 font-medium">Matches</th>
                <th className="py-1 pr-2 font-medium">WR</th>
                <th className="py-1 pr-2 font-medium">G1</th>
                <th className="py-1 font-medium">Post-board</th>
              </tr>
            </thead>
            <tbody>
              {matchups.map((r) => (
                <tr key={r.archetype} className="border-t border-white/5 personal-meta-row">
                  <td className="py-1 pr-2">
                    {r.deckId ? (
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => openDeck(r.deckId!)}
                        title="Open today's meta list"
                      >
                        {r.archetype}
                      </button>
                    ) : (
                      r.archetype
                    )}
                  </td>
                  <td className="py-1 pr-2">
                    {r.wins}–{r.losses}
                  </td>
                  <td className="py-1 pr-2">{pct(r.rate)}</td>
                  <td className="py-1 pr-2">
                    {r.g1.games ? `${pct(r.g1.rate)} (${r.g1.games}g)` : "—"}
                  </td>
                  <td className="py-1">
                    {r.post.games ? `${pct(r.post.rate)} (${r.post.games}g)` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10px] text-muted m-0 mt-1.5 leading-relaxed">
            Opponent archetypes inferred from cards seen in your matches vs today&apos;s
            ranked lists. Thin evidence is skipped, not guessed.
          </p>
        </div>
      ) : seenMatches > 0 ? (
        <p className="text-xs text-muted m-0 leading-relaxed">
          {candidates.length === 0
            ? "Opponent cards are recorded, but today's meta isn't loaded — matchup rows appear once the deck feed syncs."
            : "Opponent cards recorded, but none matched today's board closely enough to name a matchup yet."}
        </p>
      ) : (
        <p className="text-xs text-muted m-0 leading-relaxed">
          No opponent card fingerprints on this deck yet — future matches fill in the
          matchup table automatically.
        </p>
      )}
    </section>
  );
}
