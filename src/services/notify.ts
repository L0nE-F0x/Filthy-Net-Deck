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

export async function notifyDesktop(title: string, body: string): Promise<void> {
  if (isTauri()) {
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
  const before = await getNotifyPermission();
  if (before !== "granted") {
    const after = await requestNotifyPermission();
    if (after !== "granted") return false;
  }
  await notifyDesktop(
    "Filthy Net Deck",
    "Test toast — desktop notifications work on this PC.",
  );
  return true;
}
