import { useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { BoModeToggle } from "../components/BoModeToggle";
import { DEFAULT_META_URL } from "../services/metaFeed";
import { APP_VERSION } from "../version";
import { downloadInstaller } from "../services/openExternal";

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
  const installUpdate = useAppStore((s) => s.installUpdate);
  const updating = useAppStore((s) => s.updating);
  const updateProgress = useAppStore((s) => s.updateProgress);
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
        <h3 className="text-sm font-semibold m-0 mb-1">Where the data comes from</h3>
        <p className="text-xs text-muted m-0 mb-3 leading-relaxed">
          <strong className="text-foam">The app never scrapes tournament sites from your PC.</strong>{" "}
          It downloads the published meta file from Netlify (
          <code className="text-[10px]">/meta/latest.json</code>) automatically — on launch, when
          you come back online, and whenever the loaded copy is more than 90 minutes old. That
          file is rebuilt once a day from the{" "}
          <strong className="text-foam">MTGGoldfish</strong> Standard &amp; Pioneer metagame with
          every card name verified on <strong className="text-foam">Scryfall</strong>. Tournament
          links come from magic.gg, MTGO, and Melee.gg. If live data can’t be fetched, the previous
          day’s real data stays published — nothing is ever fabricated.
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
                {(meta.pipeline.sourcesDetail || []).join(", ") || "—"}
              </dd>
            </div>
          </dl>
        )}
      </section>

      <section className="panel">
        <h3 className="text-sm font-semibold m-0 mb-1">Meta feed URL</h3>
        <p className="text-xs text-muted m-0 mb-3 leading-relaxed">
          Default is the Netlify CDN. Override only for testing. If fetch fails, the app shows the
          last successfully downloaded copy — never placeholder data.
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
            disabled={loading}
            onClick={() => {
              setMetaUrl(urlDraft);
              void refreshMeta();
            }}
          >
            {loading ? "Saving…" : "Save"}
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
            <dt className="text-muted">Last sync</dt>
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
        <h3 className="text-sm font-semibold m-0 mb-1">In-app updates</h3>
        <p className="text-xs text-muted m-0 mb-3 leading-relaxed">
          App version <strong className="text-foam">v{APP_VERSION}</strong>. When a new signed
          release is published, the app can{" "}
          <strong className="text-foam">download, install, and relaunch itself</strong> — no
          reinstall, no website visit. A banner also pops up automatically when one is found.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={updating}
            onClick={() => {
              setUpdateMsg("Checking…");
              void checkForUpdates().then((result) => {
                if (result.status === "update") {
                  setUpdateMsg(`v${result.remote.version} is available.`);
                } else if (result.status === "latest") {
                  setUpdateMsg(
                    `You’re on the latest version (remote v${result.remote.version}).`,
                  );
                } else {
                  setUpdateMsg(result.message);
                }
              });
            }}
          >
            Check for updates
          </button>
          {updateAvailable?.canAutoInstall && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={updating}
              onClick={() => void installUpdate()}
            >
              {updating
                ? updateProgress != null && updateProgress >= 0
                  ? `Updating… ${updateProgress}%`
                  : "Updating…"
                : `Update to v${updateAvailable.version} & restart`}
            </button>
          )}
          {updateAvailable && !updateAvailable.canAutoInstall && updateAvailable.downloadUrl && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                void downloadInstaller(updateAvailable.downloadUrl!);
              }}
            >
              Download v{updateAvailable.version} installer
            </button>
          )}
        </div>
        {updateAvailable?.canAutoInstall && !updating && (
          <p className="text-sm text-gold-300 mt-2 mb-0">
            Update v{updateAvailable.version} ready — one click installs it and restarts the app.
          </p>
        )}
        {updateAvailable && !updateAvailable.canAutoInstall && (
          <p className="text-sm text-gold-300 mt-2 mb-0">
            Update v{updateAvailable.version} ready — running in a browser without the desktop
            updater, so use the installer download.
          </p>
        )}
        {updateMsg && !updateAvailable && (
          <p className="text-xs text-muted mt-2 mb-0">{updateMsg}</p>
        )}
      </section>

      <section className="panel">
        <h3 className="text-sm font-semibold m-0 mb-2">About Filthy Net Deck</h3>
        <p className="text-sm text-muted m-0 leading-relaxed">
          Netdeck without the guilt (or with all of it). Daily <em>Magic: The Gathering</em> meta
          for <strong className="text-foam">Standard</strong> and{" "}
          <strong className="text-foam">Pioneer</strong> — real ranked lists only, Bo1/Bo3, tiers,
          queue favorites, and tournament pulse. No Alchemy-pool formats, no placeholder decks.
        </p>
        <p className="text-xs text-muted mt-3 mb-0 leading-relaxed">
          Not affiliated with Wizards of the Coast. MTG and MTG Arena are trademarks of Wizards of
          the Coast LLC. Card images via Scryfall.
        </p>
      </section>
    </div>
  );
}
