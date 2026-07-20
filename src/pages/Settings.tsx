import { useEffect, useState } from "react";
import { LANDING_PAGES, useAppStore, type DecklistView } from "../store/useAppStore";
import type { Page } from "../types/meta";
import { BoModeToggle } from "../components/BoModeToggle";
import { ThemeToggle } from "../components/ThemeToggle";
import { TrackerOnboarding } from "../components/TrackerOnboarding";
import { APP_VERSION } from "../version";
import { downloadInstaller, openExternal } from "../services/openExternal";
import { isTauri } from "../services/appUpdater";
import { isAutostartEnabled, setAutostart } from "../services/autostart";
import { exportTrackerDiagnostic } from "../services/tracker";
import {
  getNotifyPermission,
  requestNotifyPermission,
  sendTestNotification,
  type NotifyPermission,
} from "../services/notify";
import {
  previewSfx,
  previewSoundPack,
  SFX_EVENTS,
  SOUND_CUE_SETS,
  type SoundCueSet,
} from "../services/sfx";
import { retentionSnapshot } from "../services/localRetention";

/** Sidebar labels for the launch-page picker (nav pages only). */
const PAGE_LABELS: Partial<Record<Page, string>> = {
  daily: "Decks",
  stats: "My Stats",
  climb: "Climb",
  matchups: "Matchups",
  brewlab: "Brew Lab",
  sets: "Sets",
  formats: "Format Hub",
  meta: "Events",
};

/** Local-only open-day counter — never leaves this PC. */
function LocalOpenDaysNote() {
  const snap = retentionSnapshot();
  if (snap.openDayCount <= 0) return null;
  return (
    <p className="text-xs text-muted mt-2 mb-0 leading-relaxed">
      Opened on <strong className="text-foam">{snap.openDayCount}</strong> distinct day
      {snap.openDayCount === 1 ? "" : "s"} on this PC
      {snap.day2 ? " · day-2 return" : ""}
      {snap.day7 ? " · day-7 habit" : ""}. Counters stay local — never uploaded.
    </p>
  );
}

/** X1 + v1.2 — tracker health + first-session coach. C6 — diagnostic export. */
function TrackerHealthCard() {
  const setPage = useAppStore((s) => s.setPage);
  const refreshTracker = useAppStore((s) => s.refreshTracker);
  const [diagMsg, setDiagMsg] = useState<string | null>(null);

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
        {isTauri() && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            title="Counters and flags only — no names, no matches, no file paths"
            onClick={() => {
              setDiagMsg(null);
              void exportTrackerDiagnostic()
                .then((path) => setDiagMsg(`Saved ${path}`))
                .catch((e: unknown) =>
                  setDiagMsg(e instanceof Error ? e.message : "Export failed"),
                );
            }}
          >
            Export diagnostic
          </button>
        )}
      </div>
      {diagMsg && <p className="text-xs text-muted m-0 mt-2">{diagMsg}</p>}
      <p className="text-[10px] text-muted m-0 mt-2 leading-relaxed">
        Diagnostic file = parser counters and flags only (no player names, no match
        data, no file paths). If the tracker breaks after an Arena update, attach it
        to a GitHub issue so the log parser can be fixed fast.
      </p>
    </section>
  );
}

/** X2 — discoverability for 1–9 / Ctrl+K / F11. */
function KeyboardCheatSheet() {
  const rows: { keys: string; action: string }[] = [
    { keys: "1–9", action: "Jump nav: Decks · Stats · Climb · Matchups · Brew Lab · Sets · Format Hub · Events · Settings" },
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
  const setNotifyMetaMovers = useAppStore((s) => s.setNotifyMetaMovers);
  const setOverlayEnabled = useAppStore((s) => s.setOverlayEnabled);
  const setOverlayOpacity = useAppStore((s) => s.setOverlayOpacity);
  const setOverlayStartExpanded = useAppStore((s) => s.setOverlayStartExpanded);
  const setOverlayClickThrough = useAppStore((s) => s.setOverlayClickThrough);
  const setOverlayBarClock = useAppStore((s) => s.setOverlayBarClock);
  const setOverlayBarRecord = useAppStore((s) => s.setOverlayBarRecord);
  const setOverlayPostMatch = useAppStore((s) => s.setOverlayPostMatch);
  const setDecklistView = useAppStore((s) => s.setDecklistView);
  const setClimbNewestFirst = useAppStore((s) => s.setClimbNewestFirst);
  const setDefaultPage = useAppStore((s) => s.setDefaultPage);
  const setReduceMotion = useAppStore((s) => s.setReduceMotion);
  const setHelpOpen = useAppStore((s) => s.setHelpOpen);
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

        {/* —— Interface (v2.0 — maximum knobs, sensible defaults) —— */}
        <section className="panel settings-card settings-card-span2">
          <h3 className="settings-card-title">Interface</h3>
          <p className="settings-card-desc mb-2">
            Make the app open and read the way you want. Every choice is remembered.
          </p>
          <div className="settings-toggle-list">
            <label className="settings-select-row" htmlFor="pref-landing">
              <span>
                <strong>Launch page</strong>
                <em>Which page the app opens on</em>
              </span>
              <select
                id="pref-landing"
                className="fnd-select"
                value={prefs.defaultPage}
                onChange={(e) => setDefaultPage(e.target.value as Page)}
              >
                {LANDING_PAGES.map((p) => (
                  <option key={p} value={p}>
                    {PAGE_LABELS[p] ?? p}
                  </option>
                ))}
              </select>
            </label>
            <label className="settings-select-row" htmlFor="pref-decklist">
              <span>
                <strong>Decklist view</strong>
                <em>Default layout for tracked decklists in My Stats</em>
              </span>
              <select
                id="pref-decklist"
                className="fnd-select"
                value={prefs.decklistView}
                onChange={(e) => setDecklistView(e.target.value as DecklistView)}
              >
                <option value="stacked">Stacked (Arena-style, compact)</option>
                <option value="list">List (art rows + curve)</option>
                <option value="compact">Text (smallest)</option>
              </select>
            </label>
            <label className="settings-toggle-row">
              <input
                type="checkbox"
                checked={prefs.climbNewestFirst}
                onChange={(e) => setClimbNewestFirst(e.target.checked)}
              />
              <span>
                <strong>Climb path — newest first</strong>
                <em>Latest ladder stretch on top (uncheck for season-start first)</em>
              </span>
            </label>
            <label className="settings-toggle-row">
              <input
                type="checkbox"
                checked={prefs.reduceMotion}
                onChange={(e) => setReduceMotion(e.target.checked)}
              />
              <span>
                <strong>Reduce motion</strong>
                <em>Tone down count-ups, pulses and transitions</em>
              </span>
            </label>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              title="Page-by-page tour — the same one that opens on first launch"
              onClick={() => setHelpOpen(true)}
            >
              Open help &amp; tour
            </button>
          </div>
        </section>

        <TrackerHealthCard />
        <KeyboardCheatSheet />

        {/* —— In-game overlay —— */}
        {isTauri() && (
          <section className="panel settings-card settings-card-span2">
            <h3 className="settings-card-title">In-game overlay</h3>
            <p className="settings-card-desc mb-2">
              Slim always-on-top deck tracker: mini art, mana pips, next-draw
              odds, land count. Starts collapsed (bar only) — expand with ▾.
              Drag to move, resize from the edges, snaps to screen edges. The{" "}
              <strong className="text-foam">⚙ pill</strong> in the expanded
              overlay changes opacity and these toggles in-game — no alt-tab.
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
                  checked={prefs.overlayBarClock}
                  onChange={(e) => setOverlayBarClock(e.target.checked)}
                />
                <span>
                  <strong>Clock on the minimized bar</strong>
                  <em>Match timer stays visible even when collapsed</em>
                </span>
              </label>
              <label className="settings-toggle-row">
                <input
                  type="checkbox"
                  checked={prefs.overlayBarRecord}
                  onChange={(e) => setOverlayBarRecord(e.target.checked)}
                />
                <span>
                  <strong>Record on the minimized bar</strong>
                  <em>Season W–L with this deck on the collapsed bar</em>
                </span>
              </label>
              <label className="settings-toggle-row">
                <input
                  type="checkbox"
                  checked={prefs.overlayPostMatch}
                  onChange={(e) => setOverlayPostMatch(e.target.checked)}
                />
                <span>
                  <strong>Post-match summary</strong>
                  <em>
                    Result card with season form + rank path lingers ~12s after
                    each match
                  </em>
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

        {/* —— Soundscape (opt-in, main app only) —— */}
        <section className="panel settings-card settings-card-span2 soundscape">
          <div className="soundscape-head">
            <div>
              <h3 className="settings-card-title">Soundscape</h3>
              <p className="settings-card-desc mb-0">
                Soft match sounds in the main app — never in the overlay, never
                on by default. Pick a pack, then try each cue.
              </p>
            </div>
            <label className="soundscape-master">
              <input
                type="checkbox"
                checked={prefs.soundEnabled}
                onChange={(e) => {
                  const on = e.target.checked;
                  setSoundEnabled(on);
                  if (on) previewSfx(prefs.soundCueSet, "win");
                }}
              />
              <span>{prefs.soundEnabled ? "On" : "Off"}</span>
            </label>
          </div>

          <div className="soundscape-packs" role="listbox" aria-label="Sound packs">
            {SOUND_CUE_SETS.map((set) => {
              const active = prefs.soundCueSet === set.id;
              return (
                <button
                  key={set.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`soundscape-pack${active ? " is-active" : ""}`}
                  onClick={() => {
                    setSoundCueSet(set.id as SoundCueSet);
                    previewSfx(set.id, "win");
                  }}
                >
                  <span className="soundscape-pack-vibe">{set.vibe}</span>
                  <strong>{set.label}</strong>
                  <em>{set.blurb}</em>
                  {active && (
                    <span className="soundscape-pack-check" aria-hidden="true">
                      ✓ Active
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="soundscape-cues">
            <div className="soundscape-cues-head">
              <span>Try each cue</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => void previewSoundPack(prefs.soundCueSet)}
              >
                Play pack demo
              </button>
            </div>
            <div className="soundscape-cue-grid" role="group" aria-label="Preview cues">
              {SFX_EVENTS.map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  className="soundscape-cue"
                  title={ev.blurb}
                  onClick={() => previewSfx(prefs.soundCueSet, ev.id)}
                >
                  <strong>{ev.label}</strong>
                  <em>{ev.blurb}</em>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* —— Notifications (stacked compact rows) —— */}
        <section className="panel settings-card settings-card-span2">
          <h3 className="settings-card-title">Notifications</h3>
          <p className="settings-card-desc mb-2">
            Desktop toasts stay on this PC. Match-end is on by default and fires
            from the tracker itself, so it lands even while you&apos;re mid-game
            in Arena or the app sits in the tray. If banners never pop, check
            Windows → Notifications and Focus Assist — the toast still waits in
            Action Center either way.
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
                checked={prefs.notifyMetaMovers}
                onChange={(e) => setNotifyMetaMovers(e.target.checked)}
              />
              <span>
                <strong>Meta board movers</strong>
                <em>When a deck rises or enters today&apos;s ranked board</em>
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
          <LocalOpenDaysNote />
        </section>
      </div>
    </div>
  );
}
