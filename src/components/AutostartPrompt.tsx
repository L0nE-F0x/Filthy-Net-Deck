import { useEffect, useState } from "react";
import { isTauri } from "../services/appUpdater";
import {
  isAutostartEnabled,
  setAutostart,
  shouldShowAutostartPrompt,
} from "../services/autostart";
import { useAppStore } from "../store/useAppStore";
import { helpTourWasSeen } from "../services/helpTour";
import { useLocale } from "../i18n";

/**
 * One-shot Decks-home ask. Autostart stays off until they say yes.
 * Settings → Start with your PC is the same switch, anytime.
 */
export function AutostartPrompt() {
  const { t } = useLocale();
  const asked = useAppStore((s) => s.prefs.autostartAsked);
  const markAsked = useAppStore((s) => s.markAutostartAsked);
  const helpOpen = useAppStore((s) => s.helpOpen);
  const [autostart, setAutostartState] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    void isAutostartEnabled().then((on) => {
      if (alive) setAutostartState(on);
    });
    // Hung plugin must not hide the ask forever.
    const pluginTimer = window.setTimeout(() => {
      if (alive) setAutostartState((cur) => (cur === null ? false : cur));
    }, 2000);
    return () => {
      alive = false;
      window.clearTimeout(pluginTimer);
    };
  }, []);

  useEffect(() => {
    if (helpTourWasSeen()) {
      setWaited(true);
      return;
    }
    const t = window.setTimeout(() => setWaited(true), 1200);
    return () => window.clearTimeout(t);
  }, []);

  if (
    !shouldShowAutostartPrompt({
      isDesktop: isTauri(),
      asked,
      autostart,
      helpOpen,
      tourSettled: waited,
    })
  ) {
    return null;
  }

  const accept = async () => {
    setBusy(true);
    setErr(null);
    const on = await setAutostart(true);
    setAutostartState(on);
    setBusy(false);
    if (on) markAsked();
    else setErr(t("autostart.err"));
  };

  return (
    <div className="autostart-prompt" role="region" aria-label={t("autostart.region")}>
      <span className="autostart-prompt-badge">{t("autostart.badge")}</span>
      <div className="autostart-prompt-copy">
        <strong>{t("autostart.title")}</strong>
        <span>{t("autostart.body")}</span>
        {err ? <em className="autostart-prompt-err">{err}</em> : null}
      </div>
      <div className="autostart-prompt-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy}
          onClick={() => void accept()}
        >
          {t("autostart.accept")}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={() => markAsked()}
        >
          {t("autostart.later")}
        </button>
      </div>
    </div>
  );
}
