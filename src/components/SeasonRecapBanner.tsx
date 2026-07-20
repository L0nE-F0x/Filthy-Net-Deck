import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import {
  dismissSeasonRecap,
  markSeasonRecapNotified,
  pickSeasonRecapNudge,
  seasonRecapBody,
  seasonRecapHeadline,
  seasonRecapNotifyCopy,
  shouldNotifySeasonRecap,
} from "../services/seasonRecapHabit";
import { seasonKeyOf, seasonLabel } from "../services/tracker";
import { ShareMenu } from "./ShareMenu";
import {
  climbCaption,
  communityShareOptions,
  deliverShare,
  type ShareDestination,
} from "../services/communityShare";
import { renderClimbSharePng } from "../services/shareCards";
import { notifyDesktop } from "../services/notify";

/**
 * D2-b — closed-season climb recap nudge on Climb.
 * One-shot OS notification; dismissible banner with A5 share destinations.
 */
export function SeasonRecapBanner() {
  const matches = useAppStore((s) => s.trackerMatches);
  const [tick, setTick] = useState(0);

  const nudge = useMemo(
    () => pickSeasonRecapNudge(matches),
    // tick forces re-read after dismiss
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [matches, tick],
  );

  useEffect(() => {
    if (!nudge || !shouldNotifySeasonRecap(nudge)) return;
    const { title, body } = seasonRecapNotifyCopy(nudge);
    void notifyDesktop(title, body).finally(() => {
      markSeasonRecapNotified(nudge.seasonKey);
    });
  }, [nudge]);

  const onDismiss = useCallback(() => {
    if (!nudge) return;
    dismissSeasonRecap(nudge.seasonKey);
    setTick((n) => n + 1);
  }, [nudge]);

  if (!nudge) return null;

  return (
    <section className="season-recap-banner panel" role="status">
      <div className="season-recap-copy">
        <p className="eyebrow m-0 mb-0.5">Season closed</p>
        <h3 className="text-sm font-semibold m-0 mb-0.5">
          {seasonRecapHeadline(nudge)}
        </h3>
        <p className="text-xs text-muted m-0 leading-relaxed">
          {seasonRecapBody(nudge)}
        </p>
      </div>
      <div className="season-recap-actions">
        <ShareMenu
          label={`Share ${seasonLabel(nudge.seasonKey)}`}
          hint="Climb story PNG — save, Discord, or X"
          variant="primary"
          options={communityShareOptions(seasonLabel(nudge.seasonKey))}
          onPick={async (id) => {
            const dest = id as ShareDestination;
            const seasonKey = nudge.seasonKey;
            const blob = await renderClimbSharePng({ matches, seasonKey });
            // Confirm we have matches for this season (defensive).
            const n = matches.filter((m) => seasonKeyOf(m.endedAt) === seasonKey)
              .length;
            if (!n) throw new Error("No matches in that season");
            const caption = climbCaption({
              seasonLabel: seasonLabel(seasonKey),
              wins: nudge.wins,
              losses: nudge.losses,
            });
            const result = await deliverShare({
              destination: dest,
              blob,
              filename: `filthy-net-deck-climb-${seasonKey}.png`,
              caption,
            });
            if (!result.ok) throw new Error(result.message);
            return result.message;
          }}
        />
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </section>
  );
}
