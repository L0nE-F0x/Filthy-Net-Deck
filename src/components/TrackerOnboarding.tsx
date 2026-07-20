import { useEffect, useMemo } from "react";
import { useAppStore } from "../store/useAppStore";
import {
  diagnoseTrackerHealth,
  needsOnboardingCoach,
  onboardingProgress,
  syncFunnelFromState,
  type OnboardingStep,
} from "../services/trackerHealth";
import { listTaggedOpponentCount } from "../services/matchupNotes";

/**
 * First-session coach: log → first match → first tag (D1).
 * Guided checklist + "you're live" moment when the first match lands.
 * Shown on Daily (activation), My Stats / Matchups / Climb empties, Settings.
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
  const tagged = useMemo(() => {
    void matches.length;
    return listTaggedOpponentCount();
  }, [matches.length]);

  const health = useMemo(
    () => diagnoseTrackerHealth(status, matches.length, { taggedOpponentCount: tagged }),
    [status, matches.length, tagged],
  );

  const progress = useMemo(() => onboardingProgress(health.steps), [health.steps]);
  const coach = needsOnboardingCoach(status, matches, tagged);

  // Local-only funnel stamps (never leave the PC).
  useEffect(() => {
    syncFunnelFromState(status, matches.length, tagged);
  }, [status, matches.length, tagged]);

  if (!coach && compact) return null;

  const firstMatch = matches.length
    ? [...matches].sort((a, b) => a.endedAt - b.endedAt)[0]
    : null;

  return (
    <div
      className={`tracker-onboarding${compact ? " is-compact" : ""}${
        progress.live ? " is-live" : ""
      }`}
    >
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

      {progress.live ? (
        <div className="tracker-onboarding-live" role="status">
          <strong>You&apos;re live</strong>
          <span>
            {matches.length} match{matches.length === 1 ? "" : "es"} on this PC
            {firstMatch?.deckName ? ` · started with ${firstMatch.deckName}` : ""}.
            Stats, Climb, and Matchups fill from your log only.
          </span>
        </div>
      ) : (
        <p className="eyebrow m-0 mb-2">First 2 minutes</p>
      )}

      <div
        className="tracker-onboarding-progress"
        role="progressbar"
        aria-valuenow={progress.done}
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-label={`Setup ${progress.done} of ${progress.total}`}
      >
        <div
          className="tracker-onboarding-progress-bar"
          style={{ width: `${progress.pct}%` }}
        />
        <span className="tracker-onboarding-progress-label">
          {progress.done}/{progress.total}
        </span>
      </div>

      <ol className="tracker-onboarding-steps">
        {health.steps.map((step) => (
          <OnboardingStepRow key={step.id} step={step} />
        ))}
      </ol>

      {!compact && (
        <div className="tracker-onboarding-actions">
          {health.phase === "browser" ? null : matches.length === 0 ? (
            <p className="text-xs text-muted m-0">
              Tray is fine — the tracker keeps running when you hide the window. Finish one
              ranked game with Detailed Logs on.
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
