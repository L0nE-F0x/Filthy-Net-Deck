import type { ReactNode } from "react";
import { useAppStore } from "../store/useAppStore";
import { APP_VERSION } from "../version";
import { downloadInstaller } from "../services/openExternal";

export function StatusBanners() {
  const feedStatus = useAppStore((s) => s.feedStatus);
  const updateAvailable = useAppStore((s) => s.updateAvailable);
  const dismissedUpdateVersion = useAppStore((s) => s.dismissedUpdateVersion);
  const dismissUpdate = useAppStore((s) => s.dismissUpdate);
  const installUpdate = useAppStore((s) => s.installUpdate);
  const updating = useAppStore((s) => s.updating);
  const updateProgress = useAppStore((s) => s.updateProgress);
  const metaDiff = useAppStore((s) => s.metaDiff);

  const banners: { key: string; className: string; body: ReactNode }[] = [];

  if (feedStatus === "cached") {
    banners.push({
      key: "cached",
      className: "banner banner-warn",
      body: (
        <>
          <strong>Offline</strong> — couldn’t reach Netlify, showing the last successfully
          downloaded meta (real data, possibly not today’s). The app re-syncs automatically once
          you’re back online.
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
                <span className="text-muted">
                  {" "}
                  — downloads and installs inside the app, then relaunches. No browser.
                </span>
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
              <span className="text-muted">
                {" "}
                — open the setup file after download (browser/dev fallback only).
              </span>
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

  if (metaDiff.previousDate && metaDiff.changes.length > 0) {
    const n = metaDiff.changes.length;
    banners.push({
      key: "diff",
      className: "banner banner-info",
      body: (
        <>
          <strong>Meta moved</strong> — {n} format/mode change{n === 1 ? "" : "s"} since{" "}
          {metaDiff.previousDate}. See Decks for movement notes.
        </>
      ),
    });
  }

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
