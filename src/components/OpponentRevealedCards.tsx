import { useEffect, useMemo, useState } from "react";
import { peekArenaMeta, resolveArenaMetaBatch } from "../services/arenaMeta";
import { copyToClipboard } from "../services/arenaImport";
import {
  distinctSeenGrpIds,
  revealedCardsOf,
  revealedListText,
} from "../services/opponentSeen";

/**
 * Cards the opponent revealed this match — names + art, copy as an Arena
 * list of what was actually seen. No archetype guess; the player reconstructs.
 */
export function OpponentRevealedCards({
  grpIds,
  opponentName,
}: {
  grpIds?: number[];
  opponentName?: string | null;
}) {
  const [tick, setTick] = useState(0);
  const [copied, setCopied] = useState(false);
  const ids = useMemo(() => distinctSeenGrpIds(grpIds), [grpIds]);
  const idKey = ids.join(",");

  useEffect(() => {
    if (!ids.length) return;
    let cancelled = false;
    void resolveArenaMetaBatch(ids).then(() => {
      if (!cancelled) setTick((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
    // ids is rebuilt from idKey-equivalent contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey]);

  const cards = useMemo(() => {
    void tick;
    // Raw list — repeats are quantities. Distinct `ids` is only for resolve.
    return revealedCardsOf(grpIds, peekArenaMeta);
  }, [grpIds, tick]);

  const pending = cards.filter((c) => c.pending).length;
  const named = cards.length - pending;
  const copies = cards.reduce((n, c) => n + Math.max(1, c.qty), 0);
  const who = opponentName?.trim() || "the opponent";

  if (ids.length === 0) {
    return (
      <section className="opp-read">
        <p className="text-xs text-muted m-0 leading-relaxed">
          No opponent cards recorded for this match. Arena needs Detailed Logs
          on — cards they play or show are captured automatically and never
          leave this PC.
        </p>
      </section>
    );
  }

  const onCopy = async () => {
    const text = revealedListText(cards);
    if (!text) return;
    if (await copyToClipboard(text)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <section className="opp-read" aria-label={`Cards ${who} revealed`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="dash-title m-0">
          {named} card{named === 1 ? "" : "s"} revealed
          {copies > named ? ` · ${copies} copies` : ""}
          {pending > 0 ? ` · ${pending} resolving` : ""}
        </h4>
        {named > 0 && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void onCopy()}
            title="Copy the revealed cards as Arena import text, with how many of each"
          >
            {copied ? "Copied ✓" : "Copy list"}
          </button>
        )}
      </div>
      <p className="text-xs text-muted m-0 mt-1 leading-relaxed">
        Cards {who} showed this match
        {copies > named ? ", with how many of each" : ""} — not their full 75.
        Stays on this PC.
      </p>
      <div className="opp-read-cards">
        {cards.map((c) => (
          <span
            key={c.id}
            className={`opp-read-chip${c.isLand ? " is-land" : ""}${c.pending ? " is-pending" : ""}${c.qty > 1 ? " has-qty" : ""}`}
            title={
              c.pending
                ? "Resolving card name…"
                : c.qty > 1
                  ? `${c.qty}× ${c.name}`
                  : c.name
            }
          >
            {c.art ? <img src={c.art} alt="" loading="lazy" /> : null}
            <span className="opp-read-chip-name">{c.name}</span>
            {c.qty > 1 ? (
              <span className="opp-read-chip-qty" aria-label={`${c.qty} copies`}>
                ×{c.qty}
              </span>
            ) : null}
          </span>
        ))}
      </div>
    </section>
  );
}
