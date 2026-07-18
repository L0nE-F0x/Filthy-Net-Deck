import { useEffect, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { BoModeToggle } from "../components/BoModeToggle";
import { ThemeToggle } from "../components/ThemeToggle";
import { APP_VERSION } from "../version";
import { downloadInstaller, openExternal } from "../services/openExternal";
import { isTauri } from "../services/appUpdater";
import { isAutostartEnabled, setAutostart } from "../services/autostart";

export function Settings() {
  const prefs = useAppStore((s) => s.prefs);
  const setDefaultMode = useAppStore((s) => s.setDefaultMode);
  const setNotifyArenaEve = useAppStore((s) => s.setNotifyArenaEve);
  const setNotifyMatchEnd = useAppStore((s) => s.setNotifyMatchEnd);
  const setNotifyBanlist = useAppStore((s) => s.setNotifyBanlist);
  const setFullscreenPref = useAppStore((s) => s.setFullscreenPref);
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
    <div className="settings-page">
      <div>
        <p className="eyebrow">Settings</p>
        <h2 className="text-2xl font-semibold m-0 tracking-tight">Preferences</h2>
      </div>

      <div className="settings-grid">
        {/* —— Play & look —— */}
        <section className="panel settings-card">
          <h3 className="settings-card-title">Default play mode</h3>
          <p className="settings-card-desc">
            Opens with this mode. Switch Bo1 / Bo3 anytime from the top bar.
          </p>
          <BoModeToggle mode={prefs.defaultMode} onChange={setDefaultMode} />
        </section>

        <section className="panel settings-card">
          <h3 className="settings-card-title">Appearance</h3>
          <p className="settings-card-desc">
            Dark is the default. Light lives here and on the top bar.
          </p>
          <ThemeToggle showLabels />
        </section>

        {isTauri() && (
          <section className="panel settings-card">
            <h3 className="settings-card-title">Display</h3>
            <p className="settings-card-desc">
              Fill the whole screen — no title bar. Press{" "}
              <strong className="text-foam">F11</strong> anytime.
            </p>
            <label className="settings-check">
              <input
                type="checkbox"
                checked={prefs.fullscreen}
                onChange={(e) => setFullscreenPref(e.target.checked)}
              />
              Run in fullscreen
            </label>
          </section>
        )}

        {isTauri() && (
          <section className="panel settings-card">
            <h3 className="settings-card-title">Start with your PC</h3>
            <p className="settings-card-desc">
              Launch quietly in the tray so Arena matches are always tracked.
            </p>
            <label className="settings-check">
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
              Start when I log in
            </label>
          </section>
        )}

        {/* —— Notifications (stacked compact rows) —— */}
        <section className="panel settings-card settings-card-span2">
          <h3 className="settings-card-title">Notifications</h3>
          <p className="settings-card-desc mb-2">
            Desktop toasts stay on this PC. Turn each one on only if you want it.
          </p>
          <div className="settings-toggle-list">
            <label className="settings-toggle-row">
              <input
                type="checkbox"
                checked={prefs.notifyArenaEve}
                onChange={(e) => setNotifyArenaEve(e.target.checked)}
              />
              <span>
                <strong>Set Radar · Arena eve</strong>
                <em>Day before a set drops on MTG Arena (at most once per day)</em>
              </span>
            </label>
            <label className="settings-toggle-row">
              <input
                type="checkbox"
                checked={prefs.notifyBanlist}
                onChange={(e) => setNotifyBanlist(e.target.checked)}
              />
              <span>
                <strong>B&amp;R announcements</strong>
                <em>When Standard or Pioneer ban lists change</em>
              </span>
            </label>
            <label className="settings-toggle-row">
              <input
                type="checkbox"
                checked={prefs.notifyMatchEnd}
                onChange={(e) => setNotifyMatchEnd(e.target.checked)}
              />
              <span>
                <strong>Match-end toasts</strong>
                <em>When a match records (e.g. “Win vs Rival · 64% this season”)</em>
              </span>
            </label>
          </div>
        </section>

        {/* —— Updates —— */}
        <section className="panel settings-card settings-card-span2">
          <h3 className="settings-card-title">Updates</h3>
          <p className="settings-card-desc">
            You’re on <strong className="text-foam">v{APP_VERSION}</strong>
            {meta?.date ? (
              <>
                {" "}
                · meta for <strong className="text-foam">{meta.date}</strong>
              </>
            ) : null}
            . New versions install inside the app — no reinstall dance.
          </p>
          <div className="flex flex-wrap gap-2 mt-1">
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
            {updateAvailable &&
              !updateAvailable.canAutoInstall &&
              updateAvailable.downloadUrl && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    void downloadInstaller(updateAvailable.downloadUrl!);
                  }}
                >
                  {/\.dmg(\?|$)/i.test(updateAvailable.downloadUrl)
                    ? `Download macOS v${updateAvailable.version}`
                    : `Get v${updateAvailable.version}`}
                </button>
              )}
          </div>
          {updateAvailable?.canAutoInstall && !updating && (
            <p className="text-sm text-gold-300 mt-2 mb-0">
              v{updateAvailable.version} is ready — one click and you’re done.
            </p>
          )}
          {updateAvailable &&
            !updateAvailable.canAutoInstall &&
            updateAvailable.downloadUrl &&
            /\.dmg(\?|$)/i.test(updateAvailable.downloadUrl) && (
              <p className="text-xs text-muted mt-2 mb-0 leading-relaxed">
                macOS builds ship as a signed-site dmg (auto-update signing for Apple is a later
                infra step). Download, open, and replace the app in Applications.
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

        {/* —— About —— */}
        <section className="panel settings-card settings-card-span2">
          <h3 className="settings-card-title">About</h3>
          <p className="text-sm text-muted m-0 leading-relaxed">
            Daily <strong className="text-foam">Standard</strong> and{" "}
            <strong className="text-foam">Pioneer</strong> meta, matchup notes, climb tracking, and
            private win rates — all local on your PC.
          </p>
          <p className="text-xs text-muted mt-2 mb-0 leading-relaxed">
            Fan project · not affiliated with Wizards of the Coast · card images via Scryfall
          </p>
          <p className="text-xs text-muted mt-2 mb-0 leading-relaxed">
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
    </div>
  );
}
