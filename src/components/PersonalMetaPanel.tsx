import { useMemo } from "react";
import { useAppStore } from "../store/useAppStore";
import { decksForMode } from "../services/deckHelpers";
import {
  bestPersonalArchetype,
  personalVsMeta,
} from "../services/personalMeta";
import { resolveMetaDeck } from "../services/deepLinks";
import type { FormatId } from "../types/meta";

/** Your WR on each meta deck vs its share of the board. Rows open DeckView (D2). */
export function PersonalMetaPanel() {
  const meta = useAppStore((s) => s.meta);
  const mode = useAppStore((s) => s.mode);
  const dailyFormatId = useAppStore((s) => s.dailyFormatId);
  const matches = useAppStore((s) => s.trackerMatches);
  const openDeck = useAppStore((s) => s.openDeck);

  const fmt =
    meta?.formats.find((f) => f.id === (dailyFormatId as FormatId)) ??
    meta?.formats.find((f) => f.featured) ??
    meta?.formats[0];

  const rows = useMemo(() => {
    if (!meta || !fmt) return [];
    const decks = decksForMode(fmt, mode, meta.decks);
    return personalVsMeta(matches, decks);
  }, [meta, fmt, mode, matches]);

  const best = useMemo(() => bestPersonalArchetype(rows, 3), [rows]);
  const played = rows.filter((r) => r.yourGames > 0);

  if (!meta || !fmt) return null;
  if (matches.length === 0) {
    return (
      <section className="panel">
        <p className="eyebrow m-0 mb-1">You vs the meta</p>
        <p className="text-xs text-muted m-0 leading-relaxed">
          Once the tracker records matches, this panel compares your winrate on each ranked
          archetype to its meta share.
        </p>
      </section>
    );
  }

  const openArch = (archetype: string) => {
    const hit = resolveMetaDeck(meta, archetype, {
      formatId: fmt.id as FormatId,
      mode,
    });
    if (hit) openDeck(hit.deckId);
  };

  return (
    <section className="panel">
      <p className="eyebrow m-0 mb-1">You vs the meta</p>
      <h3 className="text-sm font-semibold m-0 mb-2">
        {fmt.name} · {mode.toUpperCase()}
        {best ? (
          <span className="text-muted font-normal">
            {" "}
            · best for you:{" "}
            <button
              type="button"
              className="link-btn text-gold-300"
              onClick={() => openArch(best.archetype)}
            >
              {best.archetype}
            </button>{" "}
            ({Math.round((best.yourWinrate ?? 0) * 100)}%)
          </span>
        ) : null}
      </h3>
      {played.length === 0 ? (
        <p className="text-xs text-muted m-0">
          No name matches yet between your Arena decks and today&apos;s board — rename or keep
          playing.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted text-left">
                <th className="py-1 pr-2 font-medium">#</th>
                <th className="py-1 pr-2 font-medium">Archetype</th>
                <th className="py-1 pr-2 font-medium">Meta %</th>
                <th className="py-1 pr-2 font-medium">You</th>
                <th className="py-1 pr-2 font-medium">Form</th>
                <th className="py-1 pr-2 font-medium">WR</th>
                <th className="py-1 font-medium">Edge</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.archetype}
                  className={`border-t border-white/5${r.yourGames ? " personal-meta-row" : ""}`}
                >
                  <td className="py-1 pr-2 text-muted">{r.metaRank}</td>
                  <td className="py-1 pr-2">
                    {r.yourGames ? (
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => openArch(r.archetype)}
                        title="Open meta list"
                      >
                        {r.archetype}
                      </button>
                    ) : (
                      r.archetype
                    )}
                  </td>
                  <td className="py-1 pr-2">{r.metaShare.toFixed(1)}%</td>
                  <td className="py-1 pr-2">
                    {r.yourGames ? `${r.yourWins}–${r.yourLosses}` : "—"}
                  </td>
                  <td
                    className="py-1 pr-2 font-mono tracking-tight text-muted"
                    title="Last up to 5 matches on this deck (oldest → newest)"
                  >
                    {r.form || "—"}
                  </td>
                  <td className="py-1 pr-2">
                    {r.yourWinrate != null ? `${Math.round(r.yourWinrate * 100)}%` : "—"}
                  </td>
                  <td
                    className="py-1"
                    title="Your WR minus 50% baseline (positive = beating coin-flip)"
                  >
                    {r.edge == null
                      ? "—"
                      : `${r.edge >= 0 ? "+" : "−"}${Math.abs(Math.round(r.edge * 100))} pts`}
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
