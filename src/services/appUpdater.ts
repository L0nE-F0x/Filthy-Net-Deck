/**
 * In-app updates via the Tauri updater plugin.
 *
 * Flow: check() hits https://filthy-net-deck.netlify.app/updater/latest.json,
 * verifies the minisign signature against the pubkey baked into the app, then
 * downloadAndInstall() runs the new installer silently and relaunch() restarts.
 *
 * In a plain browser (vite dev / website preview) none of this is available —
 * every function degrades to a no-op so the old download-the-installer flow
 * still works.
 */
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** The pending update object must stay out of the store (not serializable). */
let pendingUpdate: Update | null = null;

export interface AppUpdateInfo {
  version: string;
  notes?: string;
  /** true = one-click install available; false = manual download fallback */
  canAutoInstall: boolean;
}

export async function checkAppUpdate(): Promise<AppUpdateInfo | null> {
  if (!isTauri()) return null;
  try {
    const update = await check();
    if (!update) {
      pendingUpdate = null;
      return null;
    }
    pendingUpdate = update;
    return {
      version: update.version,
      notes: update.body ?? undefined,
      canAutoInstall: true,
    };
  } catch {
    pendingUpdate = null;
    return null;
  }
}

/**
 * Download + install the pending update, then relaunch the app.
 * onProgress receives 0–100 (best effort; -1 when size unknown).
 */
export async function installPendingUpdate(
  onProgress: (pct: number) => void,
): Promise<void> {
  if (!pendingUpdate) throw new Error("No update pending — run check first.");
  let total = 0;
  let received = 0;
  await pendingUpdate.downloadAndInstall((event) => {
    if (event.event === "Started") {
      total = event.data.contentLength ?? 0;
      onProgress(total ? 0 : -1);
    } else if (event.event === "Progress") {
      received += event.data.chunkLength;
      onProgress(total ? Math.min(99, Math.round((received / total) * 100)) : -1);
    } else if (event.event === "Finished") {
      onProgress(100);
    }
  });
  await relaunch();
}
