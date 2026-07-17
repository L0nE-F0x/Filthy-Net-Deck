import { useEffect, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { BoModeToggle } from "../components/BoModeToggle";
import { APP_VERSION } from "../version";
import { downloadInstaller, openExternal } from "../services/openExternal";
import { isTauri } from "../services/appUpdater";
import { isAutostartEnabled, setAutostart } from "../services/autostart";

export function Settings() {
  const prefs = useAppStore((s) => s.prefs);
  const setDefaultMode = useAppStore((s) => s.setDefaultMode);
  const setNotifyArenaEve = useAppStore((s) => s.setNotifyArenaEve);
  const checkForUpdates = useAppStore((s) => s.checkForUpdates);
  const updateAvailable = useAppStore((s) => s.updateAvailable);
  const installUpdate = useAppStore((s) => s.installUpdate);
  const updating = useAppStore((s) => s.updating);
  const updateProgress = useAppStore((s) => s.updateProgress);
  const meta = useAppStore((s) => s.meta);

  const [updateMsg, setUpdateMsg] = useState<string | null>(null);
  const [autostart, setAutostartState] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    void isAutostartEnabled().then((on) => {
      if (alive) setAutostartState(on);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="flex flex-col gap-4 max-w-xl">
      <div>
        <p className="eyebrow">Settings</p>
        <h2 className="text-2xl font-semibold m-0 tracking-tight">Preferences</h2>
      </div>

      <section className="panel">
        <h3 className="text-sm font-semibold m-0 mb-1">Default play mode</h3>
        <p className="text-xs text-muted m-0 mb-3">
          Opens with this mode. Switch Bo1 / Bo3 anytime from the top bar.
        </p>
        <BoModeToggle mode={prefs.defaultMode} onChange={setDefaultMode} />
      </section>

      <section className="panel">
        <h3 className="text-sm font-semibold m-0 mb-1">Set Radar alerts</h3>
        <p className="text-xs text-muted m-0 mb-3 leading-relaxed">
          Optional desktop ping the day before a set drops on{" "}
          <strong className="text-foam">MTG Arena</strong>. At most once per day; stays on your
          PC.
        </p>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={prefs.notifyArenaEve}
            onChange={(e) => setNotifyArenaEve(e.target.checked)}
          />
          Notify me the day before Arena set drops
        </label>
      </section>

      {isTauri() && (
        <section className="panel">
          <h3 className="text-sm font-semibold m-0 mb-1">Start with your PC</h3>
          <p className="text-xs text-muted m-0 mb-3 leading-relaxed">
            Launches quietly in the tray when you log in, so your Arena matches are always
            tracked — even when you forget to open the app first.
          </p>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={autostart === true}
              disabled={autostart === null}
              onChange={(e) => {
                const want = e.target.checked;
                setAutostartState(want);
                void setAutostart(want).then((actual) => setAutostartState(actual));
              }}
            />
            Start Filthy Net Deck when I log in
          </label>
        </section>
      )}

      <section className="panel">
        <h3 className="text-sm font-semibold m-0 mb-1">Updates</h3>
        <p className="text-xs text-muted m-0 mb-3 leading-relaxed">
          You’re on <strong className="text-foam">v{APP_VERSION}</strong>
          {meta?.date ? (
            <>
              {" "}
              · meta for <strong className="text-foam">{meta.date}</strong>
            </>
          ) : null}
          . New versions install inside the app — no reinstall dance.
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
                  setUpdateMsg(`v${result.remote.version} is ready.`);
                } else if (result.status === "latest") {
                  setUpdateMsg("You’re up to date.");
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
              Get v{updateAvailable.version}
            </button>
          )}
        </div>
        {updateAvailable?.canAutoInstall && !updating && (
          <p className="text-sm text-gold-300 mt-2 mb-0">
            v{updateAvailable.version} is ready — one click and you’re done.
          </p>
        )}
        {updateAvailable && !updateAvailable.canAutoInstall && (
          <p className="text-sm text-gold-300 mt-2 mb-0">
            v{updateAvailable.version} is ready — use the button above to get it.
          </p>
        )}
        {updateMsg && !updateAvailable && (
          <p className="text-xs text-muted mt-2 mb-0">{updateMsg}</p>
        )}
      </section>

      <section className="panel">
        <h3 className="text-sm font-semibold m-0 mb-2">About</h3>
        <p className="text-sm text-muted m-0 leading-relaxed">
          Daily <strong className="text-foam">Standard</strong> and{" "}
          <strong className="text-foam">Pioneer</strong> meta, matchup notes, climb tracking, and
          private win rates — all local on your PC.
        </p>
        <p className="text-xs text-muted mt-3 mb-0 leading-relaxed">
          Fan project · not affiliated with Wizards of the Coast · card images via Scryfall
        </p>
        <p className="text-xs text-muted mt-3 mb-0 leading-relaxed">
          Built by{" "}
          <button
            type="button"
            className="text-gold-300 hover:text-gold-200 underline-offset-2 hover:underline bg-transparent border-0 p-0 cursor-pointer font-semibold text-xs"
            onClick={() => void openExternal("https://ame-apexforge.org/")}
          >
            ApexForge
          </button>
        </p>
      </section>
    </div>
  );
}
