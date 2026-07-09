import type { ReactNode } from "react";
import { useAppStore } from "../store/useAppStore";
import { APP_VERSION } from "../version";

function isStaleDate(metaDate: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return metaDate < today;
}

export function StatusBanners() {
  const meta = useAppStore((s) => s.meta);
  const feedStatus = useAppStore((s) => s.feedStatus);
  const updateAvailable = useAppStore((s) => s.updateAvailable);
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

  if (feedStatus === "offline") {
    banners.push({
      key: "offline",
      className: "banner banner-warn",
      body: (
        <>
          <strong>Offline pack</strong> — network meta unavailable. Showing built-in lists so you can
          still browse. Tap Refresh when online for live Goldfish / Melee data.
        </>
      ),
    });
  } else if (feedStatus === "cached") {
    banners.push({
      key: "cached",
      className: "banner banner-info",
      body: (
        <>
          <strong>Cached feed</strong> — using last known good meta.
        </>
      ),
    });
  } else if (feedStatus === "live") {
    banners.push({
      key: "live",
      className: "banner banner-ok",
      body: (
        <>
          <strong>Live feed</strong> — meta loaded from the network.
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
          <strong>Stale meta</strong> — feed date is {meta.date}, today is{" "}
          {new Date().toISOString().slice(0, 10)}. Tap Refresh or wait for the daily pipeline.
        </>
      ),
    });
  }

  if (updateAvailable) {
    banners.push({
      key: "update",
      className: "banner banner-gold",
      body: (
        <>
          <strong>Update available</strong> — v{updateAvailable.version} (you have v{APP_VERSION}).{" "}
          {updateAvailable.downloadUrl ? (
            <a href={updateAvailable.downloadUrl} target="_blank" rel="noopener noreferrer">
              Download
            </a>
          ) : (
            <span>Check the website downloads page.</span>
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
          {metaDiff.previousDate}. See Daily → Meta movement.
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
