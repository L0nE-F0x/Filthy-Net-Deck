import { useEffect, useState, type ReactNode } from "react";
import { useAppStore } from "../store/useAppStore";
import { APP_VERSION, WHATS_NEW } from "../version";
import { useLocale } from "../i18n";
import { downloadInstaller, openExternal } from "../services/openExternal";
import { STATUS_URL } from "../services/site";
import {
  fetchServiceStatus,
  isIncident,
  type ServiceStatus,
} from "../services/serviceStatus";

const LAST_SEEN_VERSION_KEY = "bbi.lastSeenVersion";

/**
 * Poll the published status so an Arena update that breaks tracking can be
 * announced *inside* the app (`docs/PLATFORM-STRATEGY.md` §2.7).
 *
 * Hourly, and deliberately late on first run: this must never compete with boot
 * or delay the splash, and an incident that started five minutes ago can wait
 * another thirty seconds to be shown.
 */
function useServiceStatus(): ServiceStatus | null {
  const [status, setStatus] = useState<ServiceStatus | null>(null);

  useEffect(() => {
    let alive = true;
    const check = () => {
      void fetchServiceStatus().then((s) => {
        if (alive) setStatus(s);
      });
    };
    const first = window.setTimeout(check, 30_000);
    const repeat = window.setInterval(check, 60 * 60 * 1000);
    return () => {
      alive = false;
      window.clearTimeout(first);
      window.clearInterval(repeat);
    };
  }, []);

  return status;
}

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
  const { t } = useLocale();
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
  const service = useServiceStatus();

  const banners: { key: string; className: string; body: ReactNode }[] = [];

  // First, and not dismissible. If tracking is known to be broken, that outranks
  // everything else here — the alternative is a user reinstalling, toggling
  // Arena settings and eventually writing a review, to fix something that is
  // not on their machine.
  if (isIncident(service)) {
    banners.push({
      key: "service-status",
      className: `banner ${service.state === "down" ? "banner-warn" : "banner-gold"}`,
      body: (
        <>
          <strong>{service.state === "down" ? t("banners.trackingDown") : t("banners.trackingDegraded")}</strong>
          {" — "}
          {service.headline}
          {service.detail ? ` ${service.detail}` : ""}{" "}
          <button
            type="button"
            className="update-dl"
            onClick={() => void openExternal(STATUS_URL)}
          >
            {t("banners.details")}
          </button>
        </>
      ),
    });
  }

  if (rankUpMoment) {
    banners.push({
      key: "rank-up",
      className: "banner banner-gold banner-rank-up",
      body: (
        <>
          <strong>{t("banners.rankUp")}</strong> — {rankUpMoment.from} → {rankUpMoment.to}. Keep the climb
          going.{" "}
          <button
            type="button"
            className="update-dl"
            onClick={() => {
              clearRankUpMoment();
              setPage("climb");
            }}
          >
            {t("banners.openClimb")}
          </button>{" "}
          <button
            type="button"
            className="update-dl"
            onClick={() => {
              clearRankUpMoment();
              setPage("stats");
            }}
          >
            {t("banners.myStats")}
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
          <strong>{t("banners.updatedTo", { version: APP_VERSION })}</strong> — {WHATS_NEW.join(" · ")}.{" "}
          <button
            type="button"
            className="update-dismiss"
            onClick={() => {
              markWhatsNewSeen();
              setShowWhatsNew(false);
            }}
          >
            {t("common.gotIt")}
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
          <strong>{t("banners.offline")}</strong> — {t("banners.offlineBody")}
        </>
      ),
    });
  }

  // "Later" hides the banner for that version across restarts. Settings still
  // shows it. A newer version than the dismissed one raises the banner again.
  if (updateAvailable && updateAvailable.version !== dismissedUpdateVersion) {
    banners.push({
      key: "update",
      className: "banner banner-gold banner-update",
      body: (
        <>
          <strong>{t("banners.newVersion")}</strong> —{" "}
          {t("banners.newVersionBody", {
            remote: updateAvailable.version,
            local: APP_VERSION,
          })}{" "}
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
                  title="Dismiss this version"
                >
                  {t("common.later")}
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
                title="Dismiss this version"
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
