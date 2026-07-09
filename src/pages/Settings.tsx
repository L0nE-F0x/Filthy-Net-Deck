import { useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { BoModeToggle } from "../components/BoModeToggle";
import { DEFAULT_META_URL } from "../services/metaFeed";

export function Settings() {
  const prefs = useAppStore((s) => s.prefs);
  const setDefaultMode = useAppStore((s) => s.setDefaultMode);
  const setMetaUrl = useAppStore((s) => s.setMetaUrl);
  const refreshMeta = useAppStore((s) => s.refreshMeta);
  const metaSource = useAppStore((s) => s.metaSource);
  const lastRefresh = useAppStore((s) => s.lastRefresh);
  const loading = useAppStore((s) => s.loading);
  const meta = useAppStore((s) => s.meta);

  const [urlDraft, setUrlDraft] = useState(prefs.metaUrl ?? "");

  return (
    <div className="flex flex-col gap-5 max-w-xl">
      <div>
        <p className="eyebrow">Settings</p>
        <h2 className="text-2xl font-semibold m-0 tracking-tight">Preferences</h2>
      </div>

      <section className="panel">
        <h3 className="text-sm font-semibold m-0 mb-1">Default play mode</h3>
        <p className="text-xs text-muted m-0 mb-3">
          Used on launch. You can still toggle Bo1/Bo3 anywhere in the app.
        </p>
        <BoModeToggle mode={prefs.defaultMode} onChange={setDefaultMode} />
      </section>

      <section className="panel">
        <h3 className="text-sm font-semibold m-0 mb-1">Meta feed</h3>
        <p className="text-xs text-muted m-0 mb-3 leading-relaxed">
          Daily JSON from your Netlify site. Leave blank to use the default host (or built-in seed
          offline).
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
            <dt className="text-muted">Source</dt>
            <dd className="m-0 font-medium capitalize">{metaSource ?? "—"}</dd>
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
        </dl>
      </section>

      <section className="panel">
        <h3 className="text-sm font-semibold m-0 mb-2">About Ban Basic Island</h3>
        <p className="text-sm text-muted m-0 leading-relaxed">
          A free desktop companion for <em>Magic: The Gathering Arena</em>. Daily deck picks across
          eight constructed formats, tier boards, matchups, sideboard notes, and tournament pulse.
        </p>
        <p className="text-xs text-muted mt-3 mb-0 leading-relaxed">
          Not affiliated with Wizards of the Coast. Magic: The Gathering and related marks are
          trademarks of Wizards of the Coast LLC. Card images via Scryfall.
        </p>
        <p className="text-xs text-muted mt-2 mb-0">Version {meta?.version ?? "0.1.0"}</p>
      </section>
    </div>
  );
}
