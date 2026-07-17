/**
 * Fullscreen control for the main window. No-ops in a plain browser so the
 * Vite dev build and tests never touch Tauri APIs.
 */

import { isTauri } from "./appUpdater";

export async function applyFullscreen(on: boolean): Promise<void> {
  if (!isTauri()) return;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setFullscreen(on);
  } catch {
    /* window API unavailable — ignore */
  }
}

export async function toggleFullscreen(): Promise<boolean | null> {
  if (!isTauri()) return null;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    const next = !(await win.isFullscreen());
    await win.setFullscreen(next);
    return next;
  } catch {
    return null;
  }
}
