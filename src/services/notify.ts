/**
 * Desktop notifications (Tauri plugin) with browser Notification fallback.
 */
import { isTauri } from "./appUpdater";

export type NotifyPermission = "granted" | "denied" | "default" | "unknown";

export async function getNotifyPermission(): Promise<NotifyPermission> {
  if (isTauri()) {
    try {
      const { isPermissionGranted } = await import(
        "@tauri-apps/plugin-notification"
      );
      return (await isPermissionGranted()) ? "granted" : "default";
    } catch {
      return "unknown";
    }
  }
  if (typeof Notification === "undefined") return "unknown";
  return Notification.permission as NotifyPermission;
}

/** Prompt the OS for notification permission. Returns the post-prompt state. */
export async function requestNotifyPermission(): Promise<NotifyPermission> {
  if (isTauri()) {
    try {
      const { isPermissionGranted, requestPermission } = await import(
        "@tauri-apps/plugin-notification"
      );
      if (await isPermissionGranted()) return "granted";
      const p = await requestPermission();
      return p === "granted" ? "granted" : p === "denied" ? "denied" : "default";
    } catch {
      return "unknown";
    }
  }
  if (typeof Notification === "undefined") return "unknown";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  const p = await Notification.requestPermission();
  return p as NotifyPermission;
}

/**
 * Mirror an alert into the top-most window (src-tauri/src/toast.rs). Windows
 * mutes OS banners while a game or any app is fullscreen; this is the surface
 * that still reaches you mid-match. Rust posts its own match-end toast, so
 * only frontend-originated alerts come through here.
 */
async function mirrorToTopmost(title: string, body: string): Promise<void> {
  if (!isTauri()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("toast_show", { title, body });
  } catch {
    /* command unavailable in browser / older builds */
  }
}

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

export async function notifyDesktop(title: string, body: string): Promise<void> {
  if (isTauri()) {
    void mirrorToTopmost(title, body);
    try {
      const { isPermissionGranted, requestPermission, sendNotification } =
        await import("@tauri-apps/plugin-notification");
      let granted = await isPermissionGranted();
      if (!granted) {
        const p = await requestPermission();
        granted = p === "granted";
      }
      if (granted) {
        sendNotification({ title, body });
        return;
      }
    } catch {
      /* fall through */
    }
  }
  if (typeof Notification !== "undefined") {
    if (Notification.permission === "granted") {
      new Notification(title, { body });
    } else if (Notification.permission !== "denied") {
      const p = await Notification.requestPermission();
      if (p === "granted") new Notification(title, { body });
    }
  }
}

/** Settings “Send test notification” — proves the OS path without finishing a match. */
export async function sendTestNotification(): Promise<boolean> {
  if ((await getNotifyPermission()) !== "granted") {
    await requestNotifyPermission();
  }
  await notifyDesktop(
    "Filthy Net Deck",
    "Test toast — desktop notifications work on this PC.",
  );
  // In the desktop app the top-most card fires even when Windows denies or
  // mutes banners, so the test still proves a working path.
  return isTauri() || (await getNotifyPermission()) === "granted";
}
