import { useEffect, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { BoModeToggle } from "../components/BoModeToggle";
import { ThemeToggle } from "../components/ThemeToggle";
import { TrackerOnboarding } from "../components/TrackerOnboarding";
import { APP_VERSION } from "../version";
import { downloadInstaller, openExternal } from "../services/openExternal";
import { isTauri } from "../services/appUpdater";
import { isAutostartEnabled, setAutostart } from "../services/autostart";
import {
  getNotifyPermission,
  requestNotifyPermission,
  sendTestNotification,
  type NotifyPermission,
} from "../services/notify";
import { previewSfx, SOUND_CUE_SETS, type SoundCueSet } from "../services/sfx";

/** X1 + v1.2 — tracker health + first-session coach. */
function TrackerHealthCard() {
  const setPage = useAppStore((s) => s.setPage);
  const refreshTracker = useAppStore((s) => s.refreshTracker);

  return (
    <section className="panel settings-card settings-card-span2">
      <h3 className="settings-card-title">Tracker health</h3>
      <p className="settings-card-desc mb-2">
        Local only — nothing leaves this machine. Answers “is it working?” without leaving Settings.
      </p>
      <TrackerOnboarding />
      <div className="flex flex-wrap gap-2 mt-2">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => void refreshTracker()}
        >
          Re-check log
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPage("stats")}>
          Open My Stats →
        </button>
      </div>
    </section>
  );
}

/** X2 — discoverability for 1–8 / Ctrl+K / F11. */
function KeyboardCheatSheet() {
  const rows: { keys: string; action: string }[] = [
    { keys: "1–8", action: "Jump nav: Decks · Stats · Climb · Matchups · Sets · Events · Format Hub · Settings" },
    { keys: "Ctrl+K", action: "Command palette — search cards, decks, pages" },
    { keys: "F11", action: "Toggle fullscreen (also in Display above)" },
  ];
  return (
    <section className="panel settings-card settings-card-span2">
      <h3 className="settings-card-title">Keyboard shortcuts</h3>
      <p className="settings-card-desc mb-2">
        Numbers work when you&apos;re not typing in a field.
      </p>
      <ul className="settings-kb-list">
        {rows.map((r) => (
          <li key={r.keys}>
            <kbd className="settings-kbd">{r.keys}</kbd>
            <span>{r.action}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Settings() {
  const prefs = useAppStore((s) => s.prefs);
  const setDefaultMode = useAppStore((s) => s.setDefaultMode);
  const setNotifyArenaEve = useAppStore((s) => s.setNotifyArenaEve);
  const setNotifyMatchEnd = useAppStore((s) => s.setNotifyMatchEnd);
  const setNotifyBanlist = useAppStore((s) => s.setNotifyBanlist);
  const setOverlayEnabled = useAppStore((s) => s.setOverlayEnabled);
  const setOverlayOpacity = useAppStore((s) => s.setOverlayOpacity);
  const setOverlayStartExpanded = useAppStore((s) => s.setOverlayStartExpanded);
  const setOverlayClickThrough = useAppStore((s) => s.setOverlayClickThrough);
  const setSoundEnabled = useAppStore((s) => s.setSoundEnabled);
  const setSoundCueSet = useAppStore((s) => s.setSoundCueSet);
  const setFullscreenPref = useAppStore((s) => s.setFullscreenPref);
  const checkForUpdates = useAppStore((s) => s.checkForUpdates);
  const updateAvailable = useAppStore((s) => s.updateAvailable);
  const installUpdate = useAppStore((s) => s.installUpdate);
  const updating = useAppStore((s) => s.updating);
  const updateProgress = useAppStore((s) => s.updateProgress);
  const meta = useAppStore((s) => s.meta);

  const [updateMsg, setUpdateMsg] = useState<string | null>(null);
  const [autostart, setAutostartState] = useState<boolean | null>(null);
  const [notifyPerm, setNotifyPerm] = useState<NotifyPermission>("unknown");
  const [testMsg, setTestMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    void isAutostartEnabled().then((on) => {
      if (alive) setAutostartState(on);
    });
    void getNotifyPermission().then((p) => {
      if (alive) setNotifyPerm(p);
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
            Dark is the default. Light lives here and on the top bar. Planeswalker
            color themes are on the sidebar <strong className="text-foam">Themes</strong>{" "}
            control — they stack with dark/light.
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

        <TrackerHealthCard />
        <KeyboardCheatSheet />

        {/* —— In-game overlay —— */}
        {isTauri() && (
          <section className="panel settings-card settings-card-span2">
            <h3 className="settings-card-title">In-game overlay</h3>
            <p className="settings-card-desc mb-2">
              Slim always-on-top deck tracker: mini art, mana pips, next-draw
              odds, land count. Starts collapsed (bar only) — expand with ▾.
              Drag to move, resize from the edges, snaps to screen edges.
              Everything is read from Arena's own log on this PC — nothing
              leaves it. If exclusive fullscreen hides the panel, switch Arena
              to borderless windowed. Running a second tracker at the same time
              can cost Arena FPS.
            </p>
            <div className="settings-toggle-list">
              <label className="settings-toggle-row">
                <input
                  type="checkbox"
                  checked={prefs.overlayEnabled}
                  onChange={(e) => setOverlayEnabled(e.target.checked)}
                />
                <span>
                  <strong>Show match overlay</strong>
                  <em>Auto show/hide with match · ▾ expands full list</em>
                </span>
              </label>
              <label className="settings-toggle-row">
                <input
                  type="checkbox"
                  checked={prefs.overlayStartExpanded}
                  onChange={(e) => setOverlayStartExpanded(e.target.checked)}
                />
                <span>
                  <strong>Start expanded</strong>
                  <em>Open with the full deck list instead of the slim bar</em>
                </span>
              </label>
              <label className="settings-toggle-row">
                <input
                  type="checkbox"
                  checked={prefs.overlayClickThrough}
                  onChange={(e) => setOverlayClickThrough(e.target.checked)}
                />
                <span>
                  <strong>Click-through</strong>
                  <em>
                    Overlay ignores the mouse — purely passive over the game.
                    Turn off here to move or resize it again
                  </em>
                </span>
              </label>
              <label className="settings-slider-row">
                <span>
                  <strong>Panel opacity</strong>
                  <em>How solid the overlay background is over the game</em>
                </span>
                <output>{Math.round(prefs.overlayOpacity * 100)}%</output>
                <input
                  type="range"
                  min={55}
                  max={100}
                  step={1}
                  value={Math.round(prefs.overlayOpacity * 100)}
                  onChange={(e) => setOverlayOpacity(Number(e.target.value) / 100)}
                  aria-label="Overlay panel opacity"
                />
              </label>
            </div>
          </section>
        )}

        {/* —— Sound (opt-in, main app only) —— */}
        <section className="panel settings-card settings-card-span2">
          <h3 className="settings-card-title">Sound</h3>
          <p className="settings-card-desc mb-2">
            Soft match-end and rank-up cues in the main app only — never in the
            overlay, never by default. Short synthesized tones (no sample packs).
            Pick a set and preview before you leave it on.
          </p>
          <div className="settings-toggle-list">
            <label className="settings-toggle-row">
              <input
                type="checkbox"
                checked={prefs.soundEnabled}
                onChange={(e) => {
                  const on = e.target.checked;
                  setSoundEnabled(on);
                  if (on) previewSfx(prefs.soundCueSet, "win");
                }}
              />
              <span>
                <strong>UI sound cues</strong>
                <em>Win / loss / draw + rank-up · off by default</em>
              </span>
            </label>
          </div>
          <div className="settings-sfx-sets" role="radiogroup" aria-label="Sound cue set">
            {SOUND_CUE_SETS.map((set) => {
              const active = prefs.soundCueSet === set.id;
              return (
                <label
                  key={set.id}
                  className={`settings-sfx-card${active ? " is-active" : ""}`}
                >
                  <input
                    type="radio"
                    name="soundCueSet"
                    value={set.id}
                    checked={active}
                    onChange={() => {
                      setSoundCueSet(set.id as SoundCueSet);
                      previewSfx(set.id, "win");
                    }}
                  />
                  <span className="settings-sfx-card-body">
                    <strong>{set.label}</strong>
                    <em>{set.blurb}</em>
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={(e) => {
                      e.preventDefault();
                      setSoundCueSet(set.id as SoundCueSet);
                      previewSfx(set.id, "rankup");
                    }}
                  >
                    Preview
                  </button>
                </label>
              );
            })}
          </div>
        </section>

        {/* —— Notifications (stacked compact rows) —— */}
        <section className="panel settings-card settings-card-span2">
          <h3 className="settings-card-title">Notifications</h3>
          <p className="settings-card-desc mb-2">
            Desktop toasts stay on this PC. Match-end is on by default. If you never
            see toasts, check Windows → Notifications and Focus Assist for Filthy Net
            Deck.
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
          {isTauri() && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  void (async () => {
                    const ok = await sendTestNotification();
                    const p = await getNotifyPermission();
                    setNotifyPerm(p);
                    setTestMsg(
                      ok
                        ? "Test toast sent — check the Windows notification area."
                        : "Permission not granted. Allow notifications for Filthy Net Deck in Windows Settings.",
                    );
                  })();
                }}
              >
                Send test notification
              </button>
              {notifyPerm !== "granted" && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    void requestNotifyPermission().then((p) => setNotifyPerm(p));
                  }}
                >
                  Request permission
                </button>
              )}
              <span className="text-muted text-xs">
                OS permission:{" "}
                <strong className="text-foam">
                  {notifyPerm === "granted"
                    ? "granted"
                    : notifyPerm === "denied"
                      ? "denied"
                      : notifyPerm === "default"
                        ? "not asked yet"
                        : "unknown"}
                </strong>
              </span>
              {testMsg && (
                <span className="text-muted text-xs w-full">{testMsg}</span>
              )}
            </div>
          )}
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
            . Prefer <strong className="text-foam">Update &amp; restart</strong> (signed, in-app).
            Opening a browser download is only the fallback when auto-install isn’t available.
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
                    const avail = useAppStore.getState().updateAvailable;
                    const mode = avail?.canAutoInstall
                      ? "Update & restart ready"
                      : "download fallback only";
                    setUpdateMsg(`v${result.remote.version} is ready (${mode}).`);
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
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    void downloadInstaller(updateAvailable.downloadUrl!);
                  }}
                >
                  {/\.dmg(\?|$)/i.test(updateAvailable.downloadUrl)
                    ? `Fallback: download macOS v${updateAvailable.version}`
                    : `Fallback: download v${updateAvailable.version}`}
                </button>
              )}
          </div>
          {updateAvailable?.canAutoInstall && !updating && (
            <p className="text-sm text-gold-300 mt-2 mb-0">
              Signed update · v{updateAvailable.version} — one click installs and restarts. No
              browser required.
            </p>
          )}
          {updateAvailable &&
            !updateAvailable.canAutoInstall &&
            updateAvailable.downloadUrl &&
            /\.dmg(\?|$)/i.test(updateAvailable.downloadUrl) && (
              <p className="text-xs text-muted mt-2 mb-0 leading-relaxed">
                macOS soft path: download the dmg from our site, open it, and replace the app in
                Applications. Full signed auto-update for Apple is a later infra step.
              </p>
            )}
          {updateAvailable && !updateAvailable.canAutoInstall && (
            <p className="text-sm text-gold-300 mt-2 mb-0">
              v{updateAvailable.version} is ready via the fallback download above (not the primary
              path on Windows when signing is available).
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
