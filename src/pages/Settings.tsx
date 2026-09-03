import { memo, useEffect, useState } from "react";
import { LANDING_PAGES, useAppStore, type DecklistView } from "../store/useAppStore";
import type { Page } from "../types/meta";
import { BoModeToggle } from "../components/BoModeToggle";
import { ThemeToggle } from "../components/ThemeToggle";
import { TrackerOnboarding } from "../components/TrackerOnboarding";
import { FriendCodes } from "../components/FriendCodes";
import { APP_VERSION } from "../version";
import { downloadInstaller, openExternal } from "../services/openExternal";
import { DONATE_URL, FEEDBACK_URL, PRIVACY_URL, appFeedbackUrl } from "../services/site";
import { EMAIL_SIGN_IN_ENABLED } from "../services/cloud/config";
import { isTauri } from "../services/appUpdater";
import { overlayClickThroughAvailable, updatesViaPackageManager } from "../services/platform";
import { isAutostartEnabled, setAutostart } from "../services/autostart";
import {
  detectSystemLocale,
  isLocalePref,
  LOCALE_IDS,
  LOCALE_NATIVE,
  useLocale,
} from "../i18n";
import { exportTrackerDiagnostic } from "../services/tracker";
import { sendTestNotification } from "../services/notify";
import {
  previewSfx,
  previewSoundPack,
  SFX_EVENTS,
  SOUND_CUE_SETS,
  type SoundCueSet,
} from "../services/sfx";
import { retentionSnapshot } from "../services/localRetention";
import type { OverlayDensity, OverlayWindowMode } from "../overlay/overlayModel";

/** Sidebar labels for the launch-page picker (nav pages only). */
const PAGE_LABELS: Partial<Record<Page, string>> = {
  daily: "Decks",
  stats: "My Stats",
  climb: "Climb",
  matchups: "Matchups",
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
  const { t } = useLocale();
  const setPage = useAppStore((s) => s.setPage);
  const refreshTracker = useAppStore((s) => s.refreshTracker);
  const [diagMsg, setDiagMsg] = useState<string | null>(null);

  return (
    <section className="panel settings-card settings-card-span2">
      <h3 className="settings-card-title">{t("settings.trackerHealth")}</h3>
      <p className="settings-card-desc mb-2">
        This check runs locally and sends nothing. Answers “is it working?” without leaving Settings.
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

/** X2 — discoverability for 1–8 / Ctrl+K / F11. */
function KeyboardCheatSheet() {
  const { t } = useLocale();
  const rows: { keys: string; action: string }[] = [
    { keys: "1–8", action: "Jump nav: Decks · Stats · Climb · Matchups · Sets · Format Hub · Events · Settings" },
    { keys: "Ctrl+K", action: "Command palette — search cards, decks, pages" },
    { keys: "F11", action: "Toggle fullscreen (also in Display above)" },
  ];
  return (
    <section className="panel settings-card settings-card-span2">
      <h3 className="settings-card-title">{t("settings.shortcuts")}</h3>
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

export const Settings = memo(function Settings() {
  const prefs = useAppStore((s) => s.prefs);
  const { t } = useLocale();
  const setLocalePref = useAppStore((s) => s.setLocalePref);
  const setDefaultMode = useAppStore((s) => s.setDefaultMode);
  const setNotifyArenaEve = useAppStore((s) => s.setNotifyArenaEve);
  const setNotifyMatchEnd = useAppStore((s) => s.setNotifyMatchEnd);
  const setNotifyBanlist = useAppStore((s) => s.setNotifyBanlist);
  const setNotifyMetaMovers = useAppStore((s) => s.setNotifyMetaMovers);
  const setHealthPing = useAppStore((s) => s.setHealthPing);
  const authName = useAppStore((s) => s.authName);
  const authError = useAppStore((s) => s.authError);
  const authPending = useAppStore((s) => s.authPending);
  const signOutCloud = useAppStore((s) => s.signOutCloud);

  const [cloudEnabled, setCloudEnabled] = useState(false);
  /** Decklists currently backed up; null until the count is known. */
  const [deckBackupCount, setDeckBackupCount] = useState<number | null>(null);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [handleValue, setHandleValue] = useState("");
  const [savedHandle, setSavedHandle] = useState<string | null>(null);
  const [profilePublic, setProfilePublic] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [handleMsg, setHandleMsg] = useState<string | null>(null);
  const [displayNameValue, setDisplayNameValue] = useState("");

  const saveDisplayName = async () => {
    setProfileBusy(true);
    setHandleMsg(null);
    try {
      const m = await import("../services/cloud/sync");
      await m.setDisplayName(displayNameValue);
    } catch (e) {
      setHandleMsg(e instanceof Error ? e.message : "Could not save that name.");
    } finally {
      setProfileBusy(false);
    }
  };

  // Pull the saved handle / visibility whenever the signed-in identity changes.
  useEffect(() => {
    if (!authName) {
      setSavedHandle(null);
      setProfilePublic(false);
      setHandleValue("");
      return;
    }
    let cancelled = false;
    void import("../services/cloud/sync")
      .then((m) => m.fetchProfileSettings())
      .then((p) => {
        if (cancelled || !p) return;
        setSavedHandle(p.handle);
        setProfilePublic(p.profilePublic);
        if (p.handle) setHandleValue(p.handle);
        setDisplayNameValue(p.displayName ?? "");
      })
      .catch(() => {
        /* leave blank — claiming will surface any real problem */
      });
    return () => {
      cancelled = true;
    };
  }, [authName]);

  const saveHandle = async () => {
    setProfileBusy(true);
    setHandleMsg(null);
    try {
      const m = await import("../services/cloud/sync");
      const claimed = await m.claimHandle(handleValue);
      setSavedHandle(claimed);
      setHandleValue(claimed);
    } catch (e) {
      setHandleMsg(e instanceof Error ? e.message : "Could not save that name.");
    } finally {
      setProfileBusy(false);
    }
  };

  const toggleProfilePublic = async (on: boolean) => {
    setProfileBusy(true);
    setProfilePublic(on);
    try {
      const m = await import("../services/cloud/sync");
      await m.setProfilePublic(on);
    } catch (e) {
      setProfilePublic(!on);
      setHandleMsg(e instanceof Error ? e.message : "Could not update visibility.");
    } finally {
      setProfileBusy(false);
    }
  };

  // Read the server-side opt-in whenever the signed-in identity changes.
  useEffect(() => {
    if (!authName) {
      setCloudEnabled(false);
      return;
    }
    let cancelled = false;
    void import("../services/cloud/sync")
      .then((m) => m.isCloudEnabled())
      .then((on) => {
        if (!cancelled) setCloudEnabled(on);
      })
      .catch(() => {
        /* leave it off — the toggle is safe to under-report */
      });
    return () => {
      cancelled = true;
    };
  }, [authName]);

  // How many lists are actually backed up. Best effort: the line above simply
  // drops the count when this fails, rather than claiming zero.
  useEffect(() => {
    if (!authName || !cloudEnabled) {
      setDeckBackupCount(null);
      return;
    }
    let cancelled = false;
    void import("../services/cloud/syncRunner")
      .then((m) => m.cloudDecksNow())
      .then((decks) => {
        if (!cancelled) setDeckBackupCount(decks.length);
      })
      .catch(() => {
        /* leave the count unknown */
      });
    return () => {
      cancelled = true;
    };
  }, [authName, cloudEnabled]);

  const toggleCloud = async (on: boolean) => {
    setCloudBusy(true);
    // Optimistic: the checkbox should not lag a click.
    setCloudEnabled(on);
    if (!on) setDeckBackupCount(null);
    try {
      const m = await import("../services/cloud/sync");
      await m.setCloudEnabled(on);
      // The backup was just deleted (or is about to be rebuilt) — a memoised
      // copy of the old library would outlive it.
      const cache = await import("../services/cloud/useCloudDecks");
      cache.clearCloudDeckCache();
      if (on) {
        // Send straight away rather than waiting for the next launch or match.
        // Opting in and seeing nothing happen reads as broken, and the first
        // run is exactly when there is a backlog worth sending.
        const runner = await import("../services/cloud/syncRunner");
        void runner.syncMatchesNow();
        // And pull the other direction. On a second machine this is the click
        // that makes the account's history appear, so it has to happen here
        // rather than at the next launch.
        void useAppStore.getState().restoreCloudHistory();
      } else {
        // Opting out deleted the backup server-side; drop the restored matches
        // with it so the merged list stops showing history that no longer has
        // anywhere to come back from.
        useAppStore.setState((s) => ({
          restoredMatches: [],
          trackerMatches: s.trackerLocal,
          restoreChecked: false,
        }));
      }
    } catch (e) {
      setCloudEnabled(!on);
      useAppStore.getState().setAuthResult({
        status: "error",
        message: e instanceof Error ? e.message : "Could not update sharing.",
      });
    } finally {
      setCloudBusy(false);
    }
  };

  const [emailStage, setEmailStage] = useState<"idle" | "code">("idle");
  const [emailValue, setEmailValue] = useState("");
  const [codeValue, setCodeValue] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);

  const sendCode = async () => {
    setEmailBusy(true);
    useAppStore.getState().setAuthPending(false);
    try {
      const m = await import("../services/cloud/auth");
      await m.sendEmailCode(emailValue);
      setEmailStage("code");
    } catch (e) {
      useAppStore.getState().setAuthResult({
        status: "error",
        message: e instanceof Error ? e.message : "Could not send the code.",
      });
    } finally {
      setEmailBusy(false);
    }
  };

  const submitCode = async () => {
    setEmailBusy(true);
    try {
      const m = await import("../services/cloud/auth");
      const result = await m.verifyEmailCode(emailValue, codeValue);
      useAppStore.getState().setAuthResult(result);
      if (result.status === "signed-in") {
        setEmailStage("idle");
        setCodeValue("");
        setEmailValue("");
      }
    } finally {
      setEmailBusy(false);
    }
  };

  /** Open the provider in the system browser; the session arrives by deep link. */
  const beginSignIn = async (provider: "google" | "discord") => {
    useAppStore.getState().setAuthPending(true);
    try {
      const m = await import("../services/cloud/auth");
      await m.startSignIn(provider);
    } catch (e) {
      useAppStore.getState().setAuthResult({
        status: "error",
        message: e instanceof Error ? e.message : "Could not start sign-in.",
      });
    }
  };
  const setOverlayEnabled = useAppStore((s) => s.setOverlayEnabled);
  const setPresenceEnabled = useAppStore((s) => s.setPresenceEnabled);
  const setOverlayOpacity = useAppStore((s) => s.setOverlayOpacity);
  const setOverlayStartExpanded = useAppStore((s) => s.setOverlayStartExpanded);
  const setOverlayClickThrough = useAppStore((s) => s.setOverlayClickThrough);
  const setOverlayBarClock = useAppStore((s) => s.setOverlayBarClock);
  const setOverlayBarRecord = useAppStore((s) => s.setOverlayBarRecord);
  const setOverlayPostMatch = useAppStore((s) => s.setOverlayPostMatch);
  const setOverlayDensity = useAppStore((s) => s.setOverlayDensity);
  const setOverlayIdleDim = useAppStore((s) => s.setOverlayIdleDim);
  const setOverlayWindowMode = useAppStore((s) => s.setOverlayWindowMode);
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

  /**
   * Linux ships as an Arch pacman package, so the app is not the thing that
   * installs its own updates there. It still reports what is out, then names
   * the command that does the work.
   */
  const packageManagedUpdates = updatesViaPackageManager();

  const [updateMsg, setUpdateMsg] = useState<string | null>(null);
  const [autostart, setAutostartState] = useState<boolean | null>(null);
  const markAutostartAsked = useAppStore((s) => s.markAutostartAsked);
  const [testMsg, setTestMsg] = useState<string | null>(null);

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
        <p className="eyebrow">{t("settings.eyebrow")}</p>
        <h2 className="text-2xl font-semibold m-0 tracking-tight">{t("settings.title")}</h2>
      </div>

      <div className="settings-grid">
        {/* —— Play & look —— */}
        <section className="panel settings-card">
          <h3 className="settings-card-title">{t("settings.playMode")}</h3>
          <p className="settings-card-desc">{t("settings.playModeDesc")}</p>
          <BoModeToggle mode={prefs.defaultMode} onChange={setDefaultMode} />
        </section>

        <section className="panel settings-card">
          <h3 className="settings-card-title">{t("settings.appearance")}</h3>
          <p className="settings-card-desc">{t("settings.appearanceDesc")}</p>
          <ThemeToggle showLabels />
          <label className="settings-select-row mt-3" htmlFor="pref-locale">
            <span>
              <strong>{t("settings.language")}</strong>
              <em>{t("settings.languageDesc")}</em>
            </span>
            <select
              id="pref-locale"
              className="fnd-select"
              value={prefs.locale}
              onChange={(e) => {
                const v = e.target.value;
                setLocalePref(isLocalePref(v) ? v : "system");
              }}
            >
              <option value="system">
                {t("settings.languageSystem", {
                  name: LOCALE_NATIVE[detectSystemLocale()],
                })}
              </option>
              {LOCALE_IDS.map((id) => (
                <option key={id} value={id}>
                  {LOCALE_NATIVE[id]}
                </option>
              ))}
            </select>
          </label>
        </section>

        {isTauri() && (
          <section className="panel settings-card">
            <h3 className="settings-card-title">{t("settings.display")}</h3>
            <p className="settings-card-desc">
              {t("settings.displayDesc")}
            </p>
            <label className="settings-check">
              <input
                type="checkbox"
                checked={prefs.fullscreen}
                onChange={(e) => setFullscreenPref(e.target.checked)}
              />
              {t("settings.fullscreen")}
            </label>
          </section>
        )}

        {isTauri() && (
          <section className="panel settings-card">
            <h3 className="settings-card-title">{t("settings.startPc")}</h3>
            <p className="settings-card-desc">{t("settings.startPcDesc")}</p>
            <label className="settings-check">
              <input
                type="checkbox"
                checked={autostart === true}
                disabled={autostart === null}
                onChange={(e) => {
                  const want = e.target.checked;
                  setAutostartState(want);
                  markAutostartAsked();
                  void setAutostart(want).then((actual) => setAutostartState(actual));
                }}
              />
              {t("settings.startWhenLogin")}
            </label>
          </section>
        )}

        {/* —— Interface (v2.0 — maximum knobs, sensible defaults) —— */}
        <section className="panel settings-card settings-card-span2">
          <h3 className="settings-card-title">{t("settings.interface")}</h3>
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
              {t("settings.openHelp")}
            </button>
            {FEEDBACK_URL && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                title="Suggest a feature or report a bug"
                onClick={() => void openExternal(appFeedbackUrl(APP_VERSION))}
              >
                {t("settings.suggest")}
              </button>
            )}
          </div>
        </section>

        {/* —— In-game overlay —— */}
        {isTauri() && (
          <section className="panel settings-card settings-card-span2">
            <h3 className="settings-card-title">{t("settings.overlay")}</h3>
            <p className="settings-card-desc mb-2">{t("settings.overlayDesc")}</p>
            <div className="settings-toggle-list">
              <label className="settings-toggle-row">
                <input
                  type="checkbox"
                  checked={prefs.overlayEnabled}
                  onChange={(e) => setOverlayEnabled(e.target.checked)}
                />
                <span>
                  <strong>{t("settings.showOverlay")}</strong>
                  <em>{t("settings.showOverlayEm")}</em>
                </span>
              </label>
              <label className="settings-select-row" htmlFor="pref-ov-window-mode">
                <span>
                  <strong>{t("settings.windowMode")}</strong>
                  <em>{t("settings.windowModeEm")}</em>
                </span>
                <select
                  id="pref-ov-window-mode"
                  className="fnd-select"
                  value={prefs.overlayWindowMode}
                  onChange={(e) =>
                    setOverlayWindowMode(e.target.value as OverlayWindowMode)
                  }
                >
                  <option value="overlay">{t("settings.overlayOpt")}</option>
                  <option value="companion">{t("settings.companionOpt")}</option>
                </select>
              </label>
              <label className="settings-toggle-row">
                <input
                  type="checkbox"
                  checked={prefs.presenceEnabled}
                  onChange={(e) => setPresenceEnabled(e.target.checked)}
                />
                <span>
                  <strong>Corner badge while Arena is open</strong>
                  <em>
                    Bottom-left mark so you can see the tracker is running on the
                    home screen and in the deck builder · ⚙ for the settings worth
                    changing between matches · dims during a match
                  </em>
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
                  <em>
                    First-run default for the overlay. After you resize or
                    collapse/expand once, that size and mode are remembered
                    across matches and restarts
                  </em>
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
                  <em>Session W–L on the collapsed bar (season stays on expand)</em>
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
                  checked={prefs.overlayIdleDim}
                  onChange={(e) => setOverlayIdleDim(e.target.checked)}
                />
                <span>
                  <strong>Dim while the mouse is away</strong>
                  <em>
                    Panel fades quieter over the game and wakes on hover — the
                    discreet default
                  </em>
                </span>
              </label>
              <label className="settings-select-row" htmlFor="pref-ov-density">
                <span>
                  <strong>List density</strong>
                  <em>
                    How much screen the expanded tracker uses — Minimal is a
                    text-only HUD
                  </em>
                </span>
                <select
                  id="pref-ov-density"
                  className="fnd-select"
                  value={prefs.overlayDensity}
                  onChange={(e) =>
                    setOverlayDensity(e.target.value as OverlayDensity)
                  }
                >
                  <option value="cozy">Cozy (large art rows)</option>
                  <option value="compact">Compact (default)</option>
                  <option value="minimal">Minimal (text only)</option>
                </select>
              </label>
              {overlayClickThroughAvailable() ? (
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
              ) : null}
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
              <h3 className="settings-card-title">{t("settings.soundscape")}</h3>
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
          <h3 className="settings-card-title">{t("settings.notifications")}</h3>
          <p className="settings-card-desc mb-2">
            Alerts stay on this PC. They&apos;re painted in a small always-on-top
            card, top-right for 7s — click-through, so it never steals a click
            from Arena, and it shows over fullscreen Arena where Windows&apos;
            own banners are muted. Match-end fires from the tracker itself, so
            it lands even while the app sits in the tray.
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
                  void sendTestNotification().then(() =>
                    setTestMsg("Test alert sent — look top-right."),
                  );
                }}
              >
                Send test alert
              </button>
              {testMsg && (
                <span className="text-muted text-xs">{testMsg}</span>
              )}
            </div>
          )}
        </section>

        {/* —— Account (optional) —— */}
        {isTauri() && (
          <section className="panel settings-card settings-card-span2">
            <h3 className="settings-card-title">{t("settings.account")}</h3>
            <p className="settings-card-desc">
              Entirely optional and free. Everything the app does today keeps
              working signed out, and always will — an account only adds extra
              features that need a server, like syncing between machines.
            </p>
            {authName ? (
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className="text-sm">
                  Signed in as <strong className="text-foam">{authName}</strong>
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => void signOutCloud()}
                >
                  Sign out
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={authPending}
                  onClick={() => void beginSignIn("google")}
                >
                  Sign in with Google
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={authPending}
                  onClick={() => void beginSignIn("discord")}
                >
                  Sign in with Discord
                </button>
                {authPending && (
                  <span className="text-muted text-xs">
                    Finish signing in in your browser…
                  </span>
                )}
              </div>
            )}

            {/* Email route — a 6-digit code, no password to forget. Hidden
                until custom SMTP is live; see EMAIL_SIGN_IN_ENABLED. */}
            {EMAIL_SIGN_IN_ENABLED && !authName && (
              <div className="settings-note mt-3">
                {emailStage === "idle" ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="flex flex-col gap-1 grow" style={{ minWidth: "14rem" }}>
                      <span className="text-xs text-muted">Or use your email</span>
                      <input
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        placeholder="you@example.com"
                        value={emailValue}
                        onChange={(e) => setEmailValue(e.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={emailBusy || !emailValue.trim()}
                      onClick={() => void sendCode()}
                    >
                      {emailBusy ? "Sending…" : "Email me a code"}
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="flex flex-col gap-1" style={{ minWidth: "10rem" }}>
                      <span className="text-xs text-muted">
                        6-digit code sent to {emailValue.trim()}
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="123456"
                        maxLength={7}
                        value={codeValue}
                        onChange={(e) => setCodeValue(e.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={emailBusy || codeValue.replace(/\D/g, "").length !== 6}
                      onClick={() => void submitCode()}
                    >
                      {emailBusy ? "Checking…" : "Sign in"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={emailBusy}
                      onClick={() => {
                        setEmailStage("idle");
                        setCodeValue("");
                      }}
                    >
                      Use a different email
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* The cloud opt-in. Signing in never starts an upload by itself. */}
            {authName && (
              <>
                <div className="settings-toggle-list mt-3">
                  <label className="settings-toggle-row">
                    <input
                      type="checkbox"
                      checked={cloudEnabled}
                      disabled={cloudBusy}
                      onChange={(e) => void toggleCloud(e.target.checked)}
                    />
                    <span>
                      <strong>Share my matches, get community matchup data</strong>
                      <em>
                        A trade, not a grab — your results feed the shared
                        winrates, and you get everyone else&apos;s back
                      </em>
                    </span>
                  </label>
                </div>
                {/*
                  Decklists ride this same opt-in (one toggle, by design), so
                  the consent line has to say so — a backup the user did not
                  know they switched on is not consent.
                */}
                {cloudEnabled && (
                  <p className="settings-note mt-2 m-0 text-xs text-muted">
                    Your match history and your own decklists are backed up with
                    this
                    {deckBackupCount != null && deckBackupCount > 0
                      ? ` — ${deckBackupCount} list${deckBackupCount === 1 ? "" : "s"} saved`
                      : ""}
                    , and both come back on any machine you sign in on. Arena&apos;s
                    logs rotate and take old matches and lists with them; this is
                    what survives that. Opponent names and the cards they revealed
                    are the exception — they stay on the PC that saw them and are
                    never uploaded, so restored matches show your side only.
                    Turning this off deletes all of it along with your shared
                    matches.
                  </p>
                )}
                <FriendCodes />
                {/* Public profile page — the shareable half of an account. */}
                <div className="settings-note mt-3">
                  <p className="m-0 mb-2 text-xs text-muted">
                    <strong className="text-foam">Your profile page</strong> — a
                    public page you can share, showing your record and the decks
                    you play. Off unless you turn it on.
                  </p>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="flex flex-col gap-1 grow" style={{ minWidth: "12rem" }}>
                      <span className="text-xs text-muted">
                        filthy-net-deck.com/u/
                      </span>
                      <input
                        type="text"
                        placeholder="your-name"
                        maxLength={24}
                        value={handleValue}
                        onChange={(e) => setHandleValue(e.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={profileBusy || !handleValue.trim()}
                      onClick={() => void saveHandle()}
                    >
                      {profileBusy ? "Saving…" : savedHandle ? "Change" : "Claim"}
                    </button>
                  </div>
                  {handleMsg && (
                    <p className="text-xs m-0 mt-2" style={{ color: "var(--color-loss)" }}>
                      {handleMsg}
                    </p>
                  )}
                  {savedHandle && (
                    <>
                      <div className="flex flex-wrap items-end gap-2 mt-2">
                        <label className="flex flex-col gap-1 grow" style={{ minWidth: "12rem" }}>
                          <span className="text-xs text-muted">
                            Display name (optional) — blank shows your handle
                          </span>
                          <input
                            type="text"
                            placeholder={savedHandle}
                            maxLength={40}
                            value={displayNameValue}
                            onChange={(e) => setDisplayNameValue(e.target.value)}
                          />
                        </label>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={profileBusy}
                          onClick={() => void saveDisplayName()}
                        >
                          Save name
                        </button>
                      </div>
                      <p className="text-xs text-muted m-0 mt-1">
                        Your real name is never used here — this is blank unless
                        you fill it in.
                      </p>
                      <label className="settings-toggle-row mt-2">
                        <input
                          type="checkbox"
                          checked={profilePublic}
                          disabled={profileBusy}
                          onChange={(e) => void toggleProfilePublic(e.target.checked)}
                        />
                        <span>
                          <strong>Make my profile page public</strong>
                          <em>
                            Anyone with the link can see it — and search engines
                            can index it
                          </em>
                        </span>
                      </label>
                      {profilePublic && (
                        <p className="text-xs text-muted m-0 mt-2">
                          Live at{" "}
                          <button
                            type="button"
                            className="link-btn"
                            onClick={() =>
                              void openExternal(
                                `https://filthy-net-deck.com/u/${savedHandle}`,
                              )
                            }
                          >
                            filthy-net-deck.com/u/{savedHandle}
                          </button>
                          . Stats only appear while match sharing is on.
                        </p>
                      )}
                    </>
                  )}
                </div>

                <div className="settings-note mt-2">
                  <p className="m-0 mb-1 text-xs text-muted">
                    <strong className="text-foam">What gets shared</strong>, per match:
                  </p>
                  <ul className="text-xs text-muted m-0 pl-4 leading-relaxed">
                    <li>which archetype you played and which you faced</li>
                    <li>win or loss, who was on the play, and the format</li>
                    <li>your rank and when it happened</li>
                  </ul>
                  <p className="m-0 mt-2 text-xs text-muted">
                    Never your opponent&apos;s name, your Arena name, or your
                    decklists. Turning this off deletes everything you&apos;ve
                    shared from the server, not just future matches.
                  </p>
                </div>
              </>
            )}

            {authError && (
              <p className="text-xs mt-2 m-0" style={{ color: "var(--color-loss)" }}>
                {authError}
              </p>
            )}
            <p className="text-xs text-muted m-0 mt-2">
              Google and Discord open your normal browser rather than a window
              inside the app, so you can see the real address bar — and because
              Google refuses sign-in from embedded windows. There is no password
              to set or forget either way.
              {EMAIL_SIGN_IN_ENABLED
                ? " The email route sends a one-time code instead."
                : ""}
            </p>
          </section>
        )}

        {/* —— Data & privacy —— */}
        <section className="panel settings-card settings-card-span2">
          <h3 className="settings-card-title">{t("settings.privacy")}</h3>
          <p className="settings-card-desc">
            Your matches, decks and stats live on this PC. Exactly two things can
            send anything out — the sharing toggle under <strong>Account</strong>{" "}
            above, and the status check below. Both are off until you turn them
            on, and signing in alone uploads nothing.
          </p>
          <div className="settings-toggle-list">
            <label className="settings-toggle-row">
              <input
                type="checkbox"
                checked={prefs.healthPing}
                onChange={(e) => setHealthPing(e.target.checked)}
              />
              <span>
                <strong>Help spot broken tracking</strong>
                <em>
                  Sends a once-a-day status check so an Arena update that breaks
                  match tracking gets noticed and fixed fast
                </em>
              </span>
            </label>
          </div>
          <div className="settings-note mt-2">
            <p className="m-0 mb-1 text-xs text-muted">
              <strong className="text-foam">Exactly what it sends</strong>, once a day —
              nothing else, ever:
            </p>
            <ul className="text-xs text-muted m-0 pl-4 leading-relaxed">
              <li>a random ID for this install (not your name or account)</li>
              <li>app version, and which log-parser version it uses</li>
              <li>Windows or macOS</li>
              <li>whether the Arena log was found, and how many lines failed to parse</li>
              <li>how many matches were recorded in the last 24 hours</li>
            </ul>
            <p className="m-0 mt-2 text-xs text-muted">
              It never sends your decks, your match results, your rank, your
              opponents, your Arena name, or any file paths. Turning this off
              deletes the random ID, so switching it back on starts fresh.
            </p>
          </div>
          {/*
            Every field either toggle can upload, published in full. Kept one
            click from the toggles themselves rather than buried on the site —
            a list nobody can find is not much of a disclosure.
          */}
          <p className="m-0 mt-3 text-xs text-muted">
            <button
              type="button"
              className="link-btn"
              onClick={() => void openExternal(PRIVACY_URL)}
            >
              Read the full list of everything the app can send
            </button>
          </p>
        </section>

        {/* —— Plumbing last: health, shortcuts, updates, about —— */}
        <TrackerHealthCard />
        <KeyboardCheatSheet />

        {/* —— Updates —— */}
        <section className="panel settings-card settings-card-span2">
          <h3 className="settings-card-title">{t("settings.updates")}</h3>
          <p className="settings-card-desc">
            You’re on <strong className="text-foam">v{APP_VERSION}</strong>
            {meta?.date ? (
              <>
                {" "}
                · meta for <strong className="text-foam">{meta.date}</strong>
              </>
            ) : null}
            .{" "}
            {packageManagedUpdates ? (
              <>
                FND is installed as a system package, so updates come from outside the app —
                there is nothing here to click.
              </>
            ) : (
              <>
                Prefer <strong className="text-foam">Update &amp; restart</strong> (signed,
                in-app). Opening a browser download is only the fallback when auto-install
                isn’t available.
              </>
            )}
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
                      : packageManagedUpdates
                        ? "rebuild the package to install it"
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
              !packageManagedUpdates &&
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
          {updateAvailable && packageManagedUpdates && (
            <>
              <p className="text-sm text-gold-300 mt-2 mb-0">
                v{updateAvailable.version} is out.
              </p>
              {updateAvailable.notes && (
                <p className="text-xs text-muted mt-1 mb-0 leading-relaxed">
                  {updateAvailable.notes}
                </p>
              )}
              {/* Until filthy-net-deck-bin is on the AUR, `omarchy update` cannot
                  see this package — it was built straight from a release, so
                  nothing tracks it upstream. Point at the recipe that does work,
                  and swap this for `omarchy update` on the release that publishes
                  to the AUR. */}
              <p className="text-xs text-muted mt-2 mb-0 leading-relaxed">
                FND is installed as a pacman package. To update, rebuild it from the current
                release — the two lines are at{" "}
                <code className="font-mono text-foam">filthy-net-deck.com/#download</code>
              </p>
            </>
          )}
          {updateAvailable && !updateAvailable.canAutoInstall && !packageManagedUpdates && (
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
          <h3 className="settings-card-title">{t("settings.about")}</h3>
          <p className="text-sm text-muted m-0 leading-relaxed">
            Daily <strong className="text-foam">Standard</strong> and{" "}
            <strong className="text-foam">Pioneer</strong> meta, matchup notes, climb tracking, and
            private win rates — all local on your PC.
          </p>
          <p className="text-xs text-muted mt-2 mb-0 leading-relaxed">
            Fan project · not affiliated with Wizards of the Coast
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
          {/* Tip jar. Hidden entirely when DONATE_URL is unset, and never
              gates a feature — the app is free and stays free. */}
          {DONATE_URL && (
            <p className="text-xs text-muted mt-2 mb-0 leading-relaxed">
              Free forever. If it helped your climb, you can{" "}
              <button
                type="button"
                className="text-gold-300 hover:text-gold-200 underline-offset-2 hover:underline bg-transparent border-0 p-0 cursor-pointer font-semibold text-xs"
                onClick={() => void openExternal(DONATE_URL)}
              >
                buy me a coffee
              </button>
              .
            </p>
          )}
          {FEEDBACK_URL && (
            <p className="text-xs text-muted mt-2 mb-0 leading-relaxed">
              Something missing, or something broken?{" "}
              <button
                type="button"
                className="text-gold-300 hover:text-gold-200 underline-offset-2 hover:underline bg-transparent border-0 p-0 cursor-pointer font-semibold text-xs"
                onClick={() => void openExternal(appFeedbackUrl(APP_VERSION))}
              >
                Suggest a feature / report a bug
              </button>
              .
            </p>
          )}
          <LocalOpenDaysNote />
        </section>
      </div>
    </div>
  );
});
