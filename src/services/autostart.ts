/**
 * "Start with your PC" (login-item on macOS / XDG on Linux). Desktop only —
 * the plugin registers the app with a --hidden flag so autostarted launches
 * go straight to the tray without popping a window over the user's login.
 *
 * Default is off. We ask once (Decks home, after the help tour) rather than
 * silently enabling at install — see docs/FRIEND-FEEDBACK-OVERLAY-IA.md §5.
 */
import { isTauri } from "./appUpdater";

/** Whether the one-shot Decks-home autostart question should appear. */
export function shouldShowAutostartPrompt(opts: {
  isDesktop: boolean;
  asked: boolean;
  /** null = still reading the OS login-item flag. */
  autostart: boolean | null;
  helpOpen: boolean;
  /**
   * Help tour has already run, or we've waited long enough that it isn't
   * coming (so we still ask next to the tracker coach).
   */
  tourSettled: boolean;
}): boolean {
  if (!opts.isDesktop) return false;
  if (opts.asked) return false;
  if (opts.autostart !== false) return false;
  if (opts.helpOpen) return false;
  if (!opts.tourSettled) return false;
  return true;
}

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
