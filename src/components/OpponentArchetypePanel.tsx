import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { decksForMode } from "../services/deckHelpers";
import {
  personalVsOpponentArchetypes,
  type VsArchetypeRow,
} from "../services/opponentArchetype";
import {
  peekArenaMeta,
  resolveArenaMetaBatch,
} from "../services/arenaMeta";
import type { FormatId } from "../types/meta";

/**
 * B1 — Your record vs meta archetypes inferred from opponent cards
 * the tracker saw (local only). Complements PersonalMetaPanel (you on meta decks).
 */
export function OpponentArchetypePanel() {
  const meta = useAppStore((s) => s.meta);
  const mode = useAppStore((s) => s.mode);
  const dailyFormatId = useAppStore((s) => s.dailyFormatId);
  const matches = useAppStore((s) => s.trackerMatches);
  const openDeck = useAppStore((s) => s.openDeck);

  const fmt =
    meta?.formats.find((f) => f.id === (dailyFormatId as FormatId)) ??
    meta?.formats.find((f) => f.featured) ??
    meta?.formats[0];

  const candidates = useMemo(() => {
    if (!meta || !fmt) return [];
    return decksForMode(fmt, mode, meta.decks);
  }, [meta, fmt, mode]);

  // All grpIds we need names for across history.
  const allIds = useMemo(() => {
    const s = new Set<number>();
    for (const m of matches) {
      for (const id of m.opponentSeen ?? []) s.add(id);
    }
    return [...s];
  }, [matches]);

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
    void resolvedTick; // re-bind when batch finishes
    return (grpId: number) => peekArenaMeta(grpId)?.name ?? null;
  }, [resolvedTick]);

  const rows: VsArchetypeRow[] = useMemo(() => {
    if (!candidates.length) return [];
    return personalVsOpponentArchetypes(matches, resolveName, candidates, {
      minHits: 2,
      minConfidence: 0.3,
    });
  }, [matches, resolveName, candidates]);

  const withSample = rows.filter((r) => r.games > 0);
  const withSeen = matches.filter((m) => (m.opponentSeen?.length ?? 0) > 0).length;

  if (!meta || !fmt) return null;

  if (matches.length === 0) {
    return (
      <section className="panel">
        <p className="eyebrow m-0 mb-1">You vs opponents</p>
        <p className="text-xs text-muted m-0 leading-relaxed">
          After the tracker sees cards the opponent plays, this panel matches them to
          today&apos;s ranked lists and shows your winrate by archetype — all on your PC.
        </p>
      </section>
    );
  }

  return (
    <section className="panel">
      <p className="eyebrow m-0 mb-1">You vs opponents</p>
      <h3 className="text-sm font-semibold m-0 mb-2">
        {fmt.name} · {mode.toUpperCase()}
        <span className="text-muted font-normal">
          {" "}
          · inferred from cards seen in match
        </span>
      </h3>
      {withSample.length === 0 ? (
        <p className="text-xs text-muted m-0 leading-relaxed">
          {withSeen === 0
            ? "No opponent card fingerprints yet. Play with Detailed Logs on — cards they cast or put into play are recorded automatically."
            : "Cards were seen, but none matched today's board closely enough. Keep playing; signature cards unlock the match."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted text-left">
                <th className="py-1 pr-2 font-medium">Archetype</th>
                <th className="py-1 pr-2 font-medium">You</th>
                <th className="py-1 font-medium">WR</th>
              </tr>
            </thead>
            <tbody>
              {withSample.map((r) => (
                <tr key={r.archetype} className="border-t border-white/5 personal-meta-row">
                  <td className="py-1 pr-2">
                    {r.deckId ? (
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => openDeck(r.deckId!)}
                        title="Open meta list"
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
                  <td className="py-1">
                    {r.winrate != null ? `${Math.round(r.winrate * 100)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
