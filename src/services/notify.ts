/**
 * In-app alerts, painted in the top-most `toast` window (src-tauri/src/toast.rs).
 *
 * There is deliberately no OS-notification path. Windows mutes its own banners
 * whenever a game — or any app — is fullscreen, and an app cannot opt out of
 * that, so the banner was silent exactly when it mattered: mid-match. The
 * always-on-top card is the only surface that reliably reaches you, so it is
 * now the only one, and there is no OS permission to grant or troubleshoot.
 */
import { isTauri } from "./appUpdater";

/** Settings → Notifications → "Show alerts over fullscreen Arena". */
export async function setTopmostToastEnabled(enabled: boolean): Promise<void> {
  if (!isTauri()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("toast_set_enabled", { enabled });
  } catch {
    /* command unavailable in browser / older builds */
  }
}

/**
 * Paint an alert in the top-most card. Rust posts its own match-end toast (it
 * works even while the app sits in the tray), so only frontend-originated
 * alerts — Set Radar, B&R, meta movers — come through here.
 */
export async function notifyDesktop(title: string, body: string): Promise<void> {
  if (!isTauri()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("toast_show", { title, body });
  } catch {
    /* command unavailable in browser / older builds */
  }
}

/** Settings “Send test alert” — proves the path without finishing a match. */
export async function sendTestNotification(): Promise<boolean> {
  await notifyDesktop(
    "Filthy Net Deck",
    "Test alert — this is how alerts look over Arena.",
  );
  return isTauri();
}
