/**
 * "Start with Windows" (login-item on macOS). Desktop only — the plugin
 * registers the app with a --hidden flag so autostarted launches go straight
 * to the tray without popping a window over the user's login.
 */
import { isTauri } from "./appUpdater";

export async function isAutostartEnabled(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { isEnabled } = await import("@tauri-apps/plugin-autostart");
    return await isEnabled();
  } catch {
    return false;
  }
}

/** Returns the resulting state (so the UI can reflect failures honestly). */
export async function setAutostart(on: boolean): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { enable, disable, isEnabled } = await import("@tauri-apps/plugin-autostart");
    if (on) await enable();
    else await disable();
    return await isEnabled();
  } catch {
    return isAutostartEnabled();
  }
}
