import { useMemo, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import {
  buildSessionWrap,
  dismissSessionWrap,
  isSessionWrapDismissed,
  sessionWrapBody,
  sessionWrapDismissKey,
  sessionWrapHeadline,
} from "../services/sessionWrap";
import { ShareMenu } from "./ShareMenu";
import {
  communityShareOptions,
  deliverShare,
  recapCaption,
  type ShareDestination,
} from "../services/communityShare";
import { renderRecapPng } from "../services/recapCard";

/**
 * After a ladder block goes idle, offer a session wrap + share.
 */
export function SessionWrapBanner() {
  const matches = useAppStore((s) => s.trackerMatches);
  const [tick, setTick] = useState(0);

  const wrap = useMemo(() => {
    void tick;
    const w = buildSessionWrap(matches);
    if (!w) return null;
    const key = sessionWrapDismissKey(w);
    if (isSessionWrapDismissed(key)) return null;
    return { w, key };
  }, [matches, tick]);

  if (!wrap) return null;
  const { w, key } = wrap;

  return (
    <section className="session-wrap-banner panel" role="status">
      <div>
        <p className="eyebrow m-0 mb-0.5">Session complete</p>
        <h3 className="text-sm font-semibold m-0 mb-0.5">{sessionWrapHeadline(w)}</h3>
        <p className="text-xs text-muted m-0 leading-relaxed">{sessionWrapBody(w)}</p>
      </div>
      <div className="session-wrap-actions">
        <ShareMenu
          label="Share session"
          hint="PNG card — save, Discord, or X"
          variant="primary"
          options={communityShareOptions("this ladder block")}
          onPick={async (id) => {
            const dest = id as ShareDestination;
            // Reuse week recap renderer with session stats window.
            const blob = await renderRecapPng(w.stats, {
              kicker: "Session wrap · local only",
            });
            const caption = recapCaption({
              wins: w.stats.wins,
              losses: w.stats.losses,
              rankDeltaLabel: w.stats.rankDeltaLabel,
              bestDeckName: w.bestDeckName,
            });
            const result = await deliverShare({
              destination: dest,
              blob,
              filename: "filthy-net-deck-session.png",
              caption: caption.replace("My week in Arena", "My Arena session"),
            });
            if (!result.ok) throw new Error(result.message);
            return result.message;
          }}
        />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            dismissSessionWrap(key);
            setTick((n) => n + 1);
          }}
        >
          Dismiss
        </button>
      </div>
    </section>
  );
}
