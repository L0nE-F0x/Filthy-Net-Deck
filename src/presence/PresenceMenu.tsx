import { presenceCall } from "./presenceCall";
import type { OverlayPrefs } from "../overlay/overlayPrefs";
import { overlayClickThroughAvailable } from "../services/platform";
import { t as translate } from "../i18n/t";

export function PresenceMenu({
  prefs,
  patch,
  onRequestClose,
  inert = false,
  fillWindow = false,
}: {
  prefs: OverlayPrefs;
  patch: (p: Record<string, unknown>) => void;
  onRequestClose: () => void;
  /** Off-screen clone used by the badge to measure the menu before opening. */
  inert?: boolean;
  /** Menu webview is sized to this panel — fill it so layout cannot drift. */
  fillWindow?: boolean;
}) {
  const t = translate;
  const radioName = inert ? "fnd-ov-mode-measure" : "fnd-ov-mode";

  return (
    <div
      className={`fnd-presence-menu${fillWindow ? " is-window" : ""}`}
      role={inert ? undefined : "menu"}
      aria-hidden={inert || undefined}
      aria-label={inert ? undefined : t("presence.menuAria")}
      {...(inert ? { inert: true } : {})}
    >
      <p className="fnd-presence-menu-title">{t("presence.title")}</p>
      <label className="fnd-presence-row">
        <input
          type="checkbox"
          tabIndex={inert ? -1 : undefined}
          checked={prefs.overlayEnabled}
          onChange={
            inert
              ? () => undefined
              : (e) => {
                  patch({ overlayEnabled: e.target.checked });
                  void presenceCall("overlay_set_enabled", {
                    enabled: e.target.checked,
                  });
                }
          }
        />
        <span>{t("presence.inGame")}</span>
      </label>
      <label className="fnd-presence-row">
        <input
          type="radio"
          name={radioName}
          tabIndex={inert ? -1 : undefined}
          checked={prefs.windowMode !== "companion"}
          onChange={
            inert
              ? () => undefined
              : () => {
                  patch({
                    overlayWindowMode: "overlay",
                    overlayWindowModeChosen: true,
                  });
                  void presenceCall("overlay_set_window_mode", {
                    companion: false,
                  });
                }
          }
        />
        <span>{t("presence.hud")}</span>
      </label>
      <label className="fnd-presence-row">
        <input
          type="radio"
          name={radioName}
          tabIndex={inert ? -1 : undefined}
          checked={prefs.windowMode === "companion"}
          onChange={
            inert
              ? () => undefined
              : () => {
                  patch({
                    overlayWindowMode: "companion",
                    overlayWindowModeChosen: true,
                  });
                  void presenceCall("overlay_set_window_mode", {
                    companion: true,
                  });
                }
          }
        />
        <span>{t("presence.normal")}</span>
      </label>
      <label className="fnd-presence-row">
        <input
          type="checkbox"
          tabIndex={inert ? -1 : undefined}
          checked={prefs.postMatch}
          onChange={
            inert
              ? () => undefined
              : (e) => {
                  patch({ overlayPostMatch: e.target.checked });
                  void presenceCall("overlay_set_post_match", {
                    enabled: e.target.checked,
                  });
                }
          }
        />
        <span>{t("presence.postMatch")}</span>
      </label>
      <label className="fnd-presence-slider">
        <span>{t("presence.opacity")}</span>
        <input
          type="range"
          min={55}
          max={100}
          step={1}
          tabIndex={inert ? -1 : undefined}
          value={Math.round(prefs.opacity * 100)}
          onChange={
            inert
              ? () => undefined
              : (e) => patch({ overlayOpacity: Number(e.target.value) / 100 })
          }
          aria-label="Overlay opacity"
        />
        <em>{Math.round(prefs.opacity * 100)}%</em>
      </label>

      <p className="fnd-presence-menu-title">Alerts</p>
      <label className="fnd-presence-row">
        <input
          type="checkbox"
          tabIndex={inert ? -1 : undefined}
          checked={prefs.notifyTopmost}
          onChange={
            inert
              ? () => undefined
              : (e) => {
                  patch({ notifyTopmost: e.target.checked });
                  void presenceCall("toast_set_enabled", {
                    enabled: e.target.checked,
                  });
                }
          }
        />
        <span>Show over fullscreen Arena</span>
      </label>

      {overlayClickThroughAvailable() ? (
      <button
        type="button"
        className="fnd-presence-danger"
        tabIndex={inert ? -1 : undefined}
        title="The HUD ignores the mouse from now on — turn it back off in the main app (Settings → In-game overlay)"
        onClick={
          inert
            ? undefined
            : () => {
                patch({ overlayClickThrough: true });
                void presenceCall("overlay_set_click_through", { ignore: true });
                onRequestClose();
              }
        }
      >
        Enable click-through
        <em>undo from the main app</em>
      </button>
      ) : null}
      <button
        type="button"
        className="fnd-presence-open"
        tabIndex={inert ? -1 : undefined}
        onClick={
          inert
            ? undefined
            : () => {
                onRequestClose();
                void presenceCall("presence_open_main");
              }
        }
      >
        Open Filthy Net Deck →
      </button>
    </div>
  );
}
