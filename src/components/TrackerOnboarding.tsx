import { useMemo } from "react";
import { useAppStore } from "../store/useAppStore";
import {
  diagnoseTrackerHealth,
  needsOnboardingCoach,
  type OnboardingStep,
} from "../services/trackerHealth";
import { listTaggedOpponentCount } from "../services/matchupNotes";

/**
 * First-session coach: log → first match → first tag.
 * Shown on My Stats / Matchups / Climb empties and Settings health.
 */
export function TrackerOnboarding({
  compact = false,
  showHealthDetail = true,
}: {
  compact?: boolean;
  showHealthDetail?: boolean;
}) {
  const status = useAppStore((s) => s.trackerStatus);
  const matches = useAppStore((s) => s.trackerMatches);
  const setPage = useAppStore((s) => s.setPage);
  // re-read notes length via match list + store tick: count tags from notes service
  const tagged = useMemo(() => listTaggedOpponentCount(), [matches.length]);

  const health = useMemo(
    () => diagnoseTrackerHealth(status, matches.length, { taggedOpponentCount: tagged }),
    [status, matches.length, tagged],
  );

  const coach = needsOnboardingCoach(status, matches, tagged);

  if (!coach && compact) return null;

  return (
    <div className={`tracker-onboarding${compact ? " is-compact" : ""}`}>
      {showHealthDetail && (
        <div className="tracker-onboarding-health">
          <p className="text-sm m-0 mb-1">
            <span
              className={`feed-dot ${
                health.tone === "good" ? "live" : health.tone === "off" ? "offline" : "offline"
              }`}
            />
            {health.headline}
          </p>
          <p className="text-xs text-muted m-0 leading-relaxed selectable">{health.detail}</p>
        </div>
      )}

      <p className="eyebrow m-0 mb-2">First 5 minutes</p>
      <ol className="tracker-onboarding-steps">
        {health.steps.map((step) => (
          <OnboardingStepRow key={step.id} step={step} />
        ))}
      </ol>

      {!compact && (
        <div className="tracker-onboarding-actions">
          {health.phase === "browser" ? null : matches.length === 0 ? (
            <p className="text-xs text-muted m-0">
              Tray is fine — the tracker keeps running when you hide the window.
            </p>
          ) : tagged === 0 ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setPage("matchups")}>
              Open Matchups to tag →
            </button>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPage("climb")}>
              See your climb →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function OnboardingStepRow({ step }: { step: OnboardingStep }) {
  return (
    <li className={`tracker-step${step.done ? " is-done" : ""}`}>
      <span className="tracker-step-mark" aria-hidden="true">
        {step.done ? "✓" : "○"}
      </span>
      <span>
        <strong>{step.label}</strong>
        <em>{step.hint}</em>
      </span>
    </li>
  );
}
