/**
 * Desktop notifications (Tauri plugin) with browser Notification fallback.
 */
import { isTauri } from "./appUpdater";

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
