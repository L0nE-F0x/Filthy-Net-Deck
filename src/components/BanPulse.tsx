import { useMemo } from "react";
import { useAppStore } from "../store/useAppStore";
import { headlineCards, summarizeBanChanges } from "../services/banPulse";

/**
 * Decks-home banner for a real-world B&R announcement. Shows until the user
 * opens the Format hub (Sets page) or dismisses it — both acknowledge the
 * new ban lists as seen.
 */
export function BanPulse() {
  const banChanges = useAppStore((s) => s.banChanges);
  const setPage = useAppStore((s) => s.setPage);
  const markBansSeen = useAppStore((s) => s.markBansSeen);

  const summary = useMemo(() => summarizeBanChanges(banChanges), [banChanges]);
  const cards = useMemo(() => headlineCards(banChanges), [banChanges]);

  if (!banChanges.length) return null;

  const total = banChanges.reduce((n, c) => n + c.added.length + c.removed.length, 0);
  const cardBit =
    cards.length > 0
      ? ` — ${cards.join(", ")}${total > cards.length ? "…" : ""}`
      : "";

  return (
    <div className="spoiler-pulse ban-pulse" role="status">
      <span className="spoiler-pulse-badge ban-pulse-badge">B&amp;R</span>
      <button
        type="button"
        className="ban-pulse-open"
        onClick={() => {
          markBansSeen();
          setPage("sets");
        }}
      >
        <span className="spoiler-pulse-copy">
          <strong>Banned &amp; Restricted update</strong>
          <span className="spoiler-pulse-detail">
            {" "}
            {summary}
            {cardBit}
          </span>
        </span>
        <span className="spoiler-pulse-cta">Ban lists →</span>
      </button>
      <button
        type="button"
        className="ban-pulse-dismiss"
        aria-label="Dismiss ban list update"
        title="Dismiss"
        onClick={markBansSeen}
      >
        ✕
      </button>
    </div>
  );
}
