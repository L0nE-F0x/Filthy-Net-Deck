import type { ReactNode } from "react";
import { useAppStore } from "../store/useAppStore";
import { APP_VERSION } from "../version";
import { downloadInstaller } from "../services/openExternal";

function isStaleDate(metaDate: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return metaDate < today;
}

export function StatusBanners() {
  const meta = useAppStore((s) => s.meta);
  const feedStatus = useAppStore((s) => s.feedStatus);
  const updateAvailable = useAppStore((s) => s.updateAvailable);
  const dismissUpdate = useAppStore((s) => s.dismissUpdate);
  const installUpdate = useAppStore((s) => s.installUpdate);
  const updating = useAppStore((s) => s.updating);
  const updateProgress = useAppStore((s) => s.updateProgress);
  const metaDiff = useAppStore((s) => s.metaDiff);
  const loading = useAppStore((s) => s.loading);

  if (loading && !meta) {
    return (
      <div className="banner-stack">
        <div className="banner skeleton-banner">
          <div className="skel skel-line w-40" />
          <div className="skel skel-line w-64" />
        </div>
      </div>
    );
  }

  const banners: { key: string; className: string; body: ReactNode }[] = [];

  if (feedStatus === "cached") {
    banners.push({
      key: "cached",
      className: "banner banner-warn",
      body: (
        <>
          <strong>Cached feed</strong> — couldn’t reach Netlify, showing the last successfully
          downloaded meta (real data, possibly not today’s). Refresh when online.
        </>
      ),
    });
  } else if (feedStatus === "live") {
    const auth = meta?.pipeline?.authoritativeLists;
    banners.push({
      key: "live",
      className: "banner banner-ok",
      body: (
        <>
          <strong>Live feed</strong> — downloaded published meta from Netlify
          {auth != null ? ` · ${auth} verified lists` : ""} · every card Scryfall-checked. Refresh
          re-fetches that file; it does not re-scrape tournaments on your PC.
        </>
      ),
    });
  }

  if (meta && isStaleDate(meta.date)) {
    banners.push({
      key: "stale",
      className: "banner banner-warn",
      body: (
        <>
          <strong>Stale meta</strong> — published feed is from {meta.date}, today is{" "}
          {new Date().toISOString().slice(0, 10)}. Waiting for the daily pipeline to publish a new
          file on Netlify; Refresh only re-downloads what is already live (it cannot scrape new
          lists).
        </>
      ),
    });
  }

  if (updateAvailable) {
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
                  — downloads, installs, and relaunches automatically.
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
                — runs your browser/download folder; open the NSIS setup to upgrade.
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
