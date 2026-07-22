import { useAppStore } from "../../store/useAppStore";
import { TrackerOnboarding } from "../TrackerOnboarding";
import { diagnoseTrackerHealth } from "../../services/trackerHealth";

export function StatusPanel() {
  const status = useAppStore((s) => s.trackerStatus);
  const matches = useAppStore((s) => s.trackerMatches);
  const health = diagnoseTrackerHealth(status, matches.length);

  if (
    health.phase === "browser" ||
    health.phase === "no_log" ||
    health.phase === "detailed_off" ||
    health.phase === "waiting_first" ||
    health.phase === "parse_stress"
  ) {
    return (
      <div
        className="panel"
        style={
          health.phase === "detailed_off" || health.phase === "parse_stress"
            ? {
                borderColor:
                  "color-mix(in srgb, var(--color-fair) 40%, transparent)",
              }
            : undefined
        }
      >
        <p className="eyebrow">Match tracking</p>
        <TrackerOnboarding />
      </div>
    );
  }

  // Healthy: one slim line — the counter says it all. Full health detail
  // (last event, log path, re-check) lives in Settings → Tracker health.
  return (
    <div className="panel status-strip">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm m-0">
          <span className="feed-dot live" />
          {health.headline}
          {status?.detailedLogs === null && (
            <span className="text-muted"> — waiting for the first Arena event…</span>
          )}
        </p>
        <span className="text-xs text-muted">
          {status?.matchesRecorded ?? 0} match
          {(status?.matchesRecorded ?? 0) === 1 ? "" : "es"} recorded · local only
        </span>
      </div>
      {status && status.parseErrors > 0 && status.parseErrors < 3 && (
        <p className="qa-flag mt-2 mb-0">
          {status.parseErrors} minor parse skip{status.parseErrors === 1 ? "" : "s"} — usually
          noise; watch this if it climbs after an Arena patch.
        </p>
      )}
    </div>
  );
}
