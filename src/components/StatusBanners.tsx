import { useState, type ReactNode } from "react";
import { useAppStore } from "../store/useAppStore";
import { APP_VERSION, WHATS_NEW } from "../version";
import { downloadInstaller } from "../services/openExternal";

const LAST_SEEN_VERSION_KEY = "bbi.lastSeenVersion";

/**
 * True exactly once per version: when a previously-run version differs from
 * the current one. Fresh installs record the version silently (no banner).
 */
function shouldShowWhatsNew(): boolean {
  try {
    const seen = localStorage.getItem(LAST_SEEN_VERSION_KEY);
    if (!seen) {
      localStorage.setItem(LAST_SEEN_VERSION_KEY, APP_VERSION);
      return false;
    }
    return seen !== APP_VERSION && WHATS_NEW.length > 0;
  } catch {
    return false;
  }
}

function markWhatsNewSeen() {
  try {
    localStorage.setItem(LAST_SEEN_VERSION_KEY, APP_VERSION);
  } catch {
    /* ignore */
  }
}

export function StatusBanners() {
  const feedStatus = useAppStore((s) => s.feedStatus);
  const updateAvailable = useAppStore((s) => s.updateAvailable);
  const dismissedUpdateVersion = useAppStore((s) => s.dismissedUpdateVersion);
  const dismissUpdate = useAppStore((s) => s.dismissUpdate);
  const installUpdate = useAppStore((s) => s.installUpdate);
  const updating = useAppStore((s) => s.updating);
  const updateProgress = useAppStore((s) => s.updateProgress);
  const rankUpMoment = useAppStore((s) => s.rankUpMoment);
  const clearRankUpMoment = useAppStore((s) => s.clearRankUpMoment);
  const setPage = useAppStore((s) => s.setPage);
  const [showWhatsNew, setShowWhatsNew] = useState(() => shouldShowWhatsNew());

  const banners: { key: string; className: string; body: ReactNode }[] = [];

  if (rankUpMoment) {
    banners.push({
      key: "rank-up",
      className: "banner banner-gold banner-rank-up",
      body: (
        <>
          <strong>Rank up</strong> — {rankUpMoment.from} → {rankUpMoment.to}. Keep the climb
          going.{" "}
          <button
            type="button"
            className="update-dl"
            onClick={() => {
              clearRankUpMoment();
              setPage("climb");
            }}
          >
            Open Climb
          </button>{" "}
          <button
            type="button"
            className="update-dl"
            onClick={() => {
              clearRankUpMoment();
              setPage("stats");
            }}
          >
            My Stats
          </button>{" "}
          <button
            type="button"
            className="update-dismiss"
            onClick={() => clearRankUpMoment()}
          >
            Dismiss
          </button>
        </>
      ),
    });
  }

  if (showWhatsNew) {
    banners.push({
      key: "whats-new",
      className: "banner banner-gold",
      body: (
        <>
          <strong>Updated to v{APP_VERSION}</strong> — {WHATS_NEW.join(" · ")}.{" "}
          <button
            type="button"
            className="update-dismiss"
            onClick={() => {
              markWhatsNewSeen();
              setShowWhatsNew(false);
            }}
          >
            Got it
          </button>
        </>
      ),
    });
  }

  if (feedStatus === "cached") {
    banners.push({
      key: "cached",
      className: "banner banner-warn",
      body: (
        <>
          <strong>Offline</strong> — showing your last downloaded meta. Re-syncs
          automatically when you’re back online.
        </>
      ),
    });
  }

  // "Later" hides the banner for that version until next launch; the hourly
  // sync re-detects the update but must not re-raise it. Settings still shows it.
  if (updateAvailable && updateAvailable.version !== dismissedUpdateVersion) {
    banners.push({
      key: "update",
      className: "banner banner-gold banner-update",
      body: (
        <>
          <strong>New version available</strong> — v{updateAvailable.version} is out (you have v
          {APP_VERSION}
          ).{" "}
          {updateAvailable.notes ? (
            <span className="text-muted">{updateAvailable.notes} </span>
          ) : null}
          {updateAvailable.canAutoInstall ? (
            updating ? (
              <span className="text-muted">
                {updateProgress != null && updateProgress >= 0
                  ? `Updating… ${updateProgress}%`
                  : "Updating…"}{" "}
                The app restarts itself when done.
              </span>
            ) : (
              <>
                <button
                  type="button"
                  className="update-dl"
                  onClick={() => void installUpdate()}
                >
                  Update &amp; restart
                </button>
                <span className="text-muted"> — installs in-app, then relaunches.</span>
                <button
                  type="button"
                  className="update-dismiss"
                  onClick={() => dismissUpdate()}
                  title="Dismiss until next launch"
                >
                  Later
                </button>
              </>
            )
          ) : updateAvailable.downloadUrl ? (
            <>
              <button
                type="button"
                className="update-dl"
                onClick={() => {
                  void downloadInstaller(updateAvailable.downloadUrl!);
                }}
              >
                Download installer
              </button>
              <span className="text-muted"> — run the setup file once it downloads.</span>
              <button
                type="button"
                className="update-dismiss"
                onClick={() => dismissUpdate()}
                title="Dismiss until next launch"
              >
                Later
              </button>
            </>
          ) : (
            <span>Open Settings → Check for updates.</span>
          )}
        </>
      ),
    });
  }

  // v2.5.0 — no daily "meta moved" banner: movement already shows as chips on
  // every deck card and in the timeline's Movers line. Banners are for events
  // that need action (rank up, update, offline), not daily weather.

  if (!banners.length) return null;

  return (
    <div className="banner-stack">
      {banners.map((b) => (
        <div key={b.key} className={b.className}>
          {b.body}
        </div>
      ))}
    </div>
  );
}
