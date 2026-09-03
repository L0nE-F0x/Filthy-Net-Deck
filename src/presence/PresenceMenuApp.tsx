/**
 * Cog-menu webview (`#/presence-menu`). A separate window from the badge so
 * neither surface resizes after it is mapped — on Wayland, `set_position` is
 * a no-op and Hyprland resizes floating windows about their centre, which
 * pushed the old combined window off-screen.
 */
import { useEffect } from "react";
import { PresenceMenu } from "./PresenceMenu";
import { presenceCall } from "./presenceCall";
import { usePresenceChrome } from "./usePresenceChrome";

function dismiss() {
  void presenceCall("presence_close_menu");
}

export function PresenceMenuApp() {
  const { prefs, patch } = usePresenceChrome();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    const onBlur = () => {
      window.setTimeout(() => {
        void presenceCall("presence_close_menu_if_unfocused");
      }, 100);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  return (
    <PresenceMenu
      prefs={prefs}
      patch={patch}
      onRequestClose={dismiss}
      fillWindow
    />
  );
}
