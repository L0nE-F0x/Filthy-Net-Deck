/**
 * In-app updates (desktop).
 *
 * 1. **Signed (preferred):** Tauri updater plugin checks
 *    `updater/latest.json`, verifies minisign, downloadAndInstall + relaunch.
 * 2. **Silent NSIS fallback:** download official setup from Netlify into temp,
 *    run `/S`, relaunch — never opens Chrome.
 * 3. **Browser:** last resort outside Tauri (vite preview only).
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** The pending update object must stay out of the store (not serializable). */
let pendingUpdate: Update | null = null;

export type UpdateInstallMode = "signed" | "silent" | "browser";

export interface AppUpdateInfo {
  version: string;
  notes?: string;
  downloadUrl?: string;
  /** true = one click installs inside the app (signed or silent NSIS) */
  canAutoInstall: boolean;
  installMode: UpdateInstallMode;
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
      installMode: "signed",
    };
  } catch {
    pendingUpdate = null;
    return null;
  }
}

/**
 * Download + install the pending signed update, then relaunch the app.
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

/**
 * Download the official NSIS setup and install silently (Windows desktop).
 * The Rust side exits the app so files can be replaced, then relaunches.
 */
export async function installSilentFromUrl(
  url: string,
  onProgress: (pct: number) => void,
): Promise<void> {
  if (!isTauri()) {
    throw new Error("Silent install requires the desktop app.");
  }
  if (!url) throw new Error("Missing installer URL.");

  const unlisten = await listen<number>("updater:progress", (e) => {
    const n = typeof e.payload === "number" ? e.payload : -1;
    onProgress(n);
  });
  try {
    onProgress(0);
    await invoke("install_update_silent", { url });
    // Process normally exits on success; if we return, treat as done.
    onProgress(100);
  } finally {
    unlisten();
  }
}
