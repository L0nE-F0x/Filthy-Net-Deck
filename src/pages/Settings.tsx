import { useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { BoModeToggle } from "../components/BoModeToggle";
import { DEFAULT_META_URL } from "../services/metaFeed";
import { APP_VERSION } from "../version";

export function Settings() {
  const prefs = useAppStore((s) => s.prefs);
  const setDefaultMode = useAppStore((s) => s.setDefaultMode);
  const setMetaUrl = useAppStore((s) => s.setMetaUrl);
  const refreshMeta = useAppStore((s) => s.refreshMeta);
  const checkForUpdates = useAppStore((s) => s.checkForUpdates);
  const feedStatus = useAppStore((s) => s.feedStatus);
  const lastRefresh = useAppStore((s) => s.lastRefresh);
  const loading = useAppStore((s) => s.loading);
  const meta = useAppStore((s) => s.meta);
  const updateAvailable = useAppStore((s) => s.updateAvailable);
  const favorites = useAppStore((s) => s.favorites);

  const [urlDraft, setUrlDraft] = useState(prefs.metaUrl ?? "");
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4 max-w-xl">
      <div>
        <p className="eyebrow">Settings</p>
        <h2 className="text-2xl font-semibold m-0 tracking-tight">Preferences</h2>
      </div>

      <section className="panel">
        <h3 className="text-sm font-semibold m-0 mb-1">Default play mode</h3>
        <p className="text-xs text-muted m-0 mb-3">
          Used on launch. Toggle Bo1/Bo3 anytime in the top bar.
        </p>
        <BoModeToggle mode={prefs.defaultMode} onChange={setDefaultMode} />
      </section>

      <section className="panel">
        <h3 className="text-sm font-semibold m-0 mb-1">What Refresh does</h3>
        <p className="text-xs text-muted m-0 mb-3 leading-relaxed">
          <strong className="text-foam">Refresh does not scrape tournament sites from your PC.</strong>{" "}
          It re-downloads the published meta file from Netlify (
          <code className="text-[10px]">/meta/latest.json</code>
          ). That file is built offline by our multi-source pipeline (MTGGoldfish metagame + deck
          exports, Melee events). Pipeline freshness = how often CI/you run{" "}
          <code className="text-[10px]">npm run meta</code>.
        </p>
        {meta?.pipeline && (
          <dl className="grid grid-cols-2 gap-2 text-xs m-0 mb-3">
            <div>
              <dt className="text-muted">Verified lists</dt>
              <dd className="m-0 font-medium">{meta.pipeline.authoritativeLists ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted">Failed exports</dt>
              <dd className="m-0 font-medium">{meta.pipeline.failedLists ?? "—"}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-muted">Pipeline</dt>
              <dd className="m-0 font-medium text-[11px]">
                {meta.pipeline.ranLive ? "live multi-source" : "offline pack"} ·{" "}
                {(meta.pipeline.sourcesDetail || []).join(", ") || "—"}
              </dd>
            </div>
          </dl>
        )}
      </section>

      <section className="panel">
        <h3 className="text-sm font-semibold m-0 mb-1">Meta feed URL</h3>
        <p className="text-xs text-muted m-0 mb-3 leading-relaxed">
          Default is the Netlify CDN. Override only for testing. If fetch fails, the app uses the
          installer&apos;s offline pack (never labeled as live).
        </p>
        <label className="block text-xs text-muted mb-1" htmlFor="meta-url">
          Meta URL
        </label>
        <input
          id="meta-url"
          type="url"
          value={urlDraft}
          onChange={(e) => setUrlDraft(e.target.value)}
          placeholder={DEFAULT_META_URL}
          className="w-full rounded-lg bg-ink-950 border border-ink-600/60 px-3 py-2 text-sm text-foam mb-3"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              setMetaUrl(urlDraft);
              void refreshMeta();
            }}
          >
            Save &amp; refresh
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={loading}
            onClick={() => void refreshMeta()}
          >
            {loading ? "Refreshing…" : "Refresh now"}
          </button>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-2 text-xs m-0">
          <div>
            <dt className="text-muted">Feed</dt>
            <dd className="m-0 font-medium capitalize">{feedStatus ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted">Meta date</dt>
            <dd className="m-0 font-medium">{meta?.date ?? "—"}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-muted">Last refresh</dt>
            <dd className="m-0 font-medium">
              {lastRefresh ? new Date(lastRefresh).toLocaleString() : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Queued decks</dt>
            <dd className="m-0 font-medium">{favorites.length}</dd>
          </div>
        </dl>
      </section>

      <section className="panel">
        <h3 className="text-sm font-semibold m-0 mb-1">In-app app updates</h3>
        <p className="text-xs text-muted m-0 mb-3 leading-relaxed">
          App version <strong className="text-foam">v{APP_VERSION}</strong>. Checks{" "}
          <code className="text-[11px]">version.json</code> on Netlify. You do{" "}
          <strong className="text-foam">not</strong> need to open the website — download the
          installer from here and run it.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              void checkForUpdates().then(() => {
                const u = useAppStore.getState().updateAvailable;
                setUpdateMsg(
                  u
                    ? `v${u.version} is available`
                    : "You’re on the latest version (or check failed).",
                );
              });
            }}
          >
            Check for updates
          </button>
          {updateAvailable?.downloadUrl && (
            <a
              className="btn btn-primary btn-sm"
              href={updateAvailable.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Download v{updateAvailable.version} installer
            </a>
          )}
        </div>
        {updateAvailable && (
          <p className="text-sm text-gold-300 mt-2 mb-0">
            Update v{updateAvailable.version} ready — install over this app (same or newer NSIS
            setup). Silent signed auto-update (Tauri updater plugin) can be added once release
            signing keys exist.
          </p>
        )}
        {updateMsg && !updateAvailable && (
          <p className="text-xs text-muted mt-2 mb-0">{updateMsg}</p>
        )}
      </section>

      <section className="panel">
        <h3 className="text-sm font-semibold m-0 mb-2">About Filthy Net Deck</h3>
        <p className="text-sm text-muted m-0 leading-relaxed">
          Netdeck without the guilt (or with all of it). Daily meta for{" "}
          <em>Magic: The Gathering Arena</em> — eight ranked decks per format, Bo1/Bo3, tiers,
          matchups, queue favorites, and tournament pulse.
        </p>
        <p className="text-xs text-muted mt-3 mb-0 leading-relaxed">
          Not affiliated with Wizards of the Coast. MTG and MTG Arena are trademarks of Wizards of
          the Coast LLC. Card images via Scryfall.
        </p>
      </section>
    </div>
  );
}
