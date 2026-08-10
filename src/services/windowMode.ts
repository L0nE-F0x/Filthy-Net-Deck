/**
 * Fullscreen + tray controls for the main window. No-ops in a plain browser so
 * the Vite dev build and tests never touch Tauri APIs.
 *
 * Prefer Rust-side commands when available: Windows often ignores hide/close
 * while the window is exclusive-fullscreen, and the OS fullscreen bit can
 * desync from our prefs (Exit then appears to do nothing).
 */

import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./appUpdater";

async function jsWindow() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

export async function applyFullscreen(on: boolean): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke("main_window_set_fullscreen", { on });
    return;
  } catch (e) {
    console.warn("[windowMode] main_window_set_fullscreen failed", e);
  }
  try {
    await (await jsWindow()).setFullscreen(on);
  } catch (e) {
    console.warn("[windowMode] setFullscreen fallback failed", e);
  }
}

/**
 * Hide the main window to the system tray (tracker keeps running).
 * Same end state as the titlebar ✕ — but exits fullscreen first so Windows
 * actually honors hide, and fires the one-time tray hint from Rust.
 */
export async function closeToTray(): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke("main_window_hide_to_tray");
    return;
  } catch (e) {
    console.warn("[windowMode] main_window_hide_to_tray failed", e);
  }
  try {
    const win = await jsWindow();
    // Windows: hide while exclusive-fullscreen is a no-op more often than not.
    try {
      if (await win.isFullscreen()) await win.setFullscreen(false);
    } catch {
      /* ignore */
    }
    await win.hide();
  } catch (e) {
    console.warn("[windowMode] hide fallback failed", e);
    try {
      await (await jsWindow()).close();
    } catch (e2) {
      console.warn("[windowMode] close fallback failed", e2);
    }
  }
}

/**
 * Toggle OS fullscreen. Returns the new fullscreen state, or null if the
 * window API is unavailable. Callers should persist that into prefs.
 *
 * Prefer prefs + applyFullscreen(false) for the "Exit fullscreen" button so a
 * desynced isFullscreen() cannot flip the wrong way.
 */
export async function toggleFullscreen(): Promise<boolean | null> {
  if (!isTauri()) return null;
  try {
    const win = await jsWindow();
    const next = !(await win.isFullscreen());
    await applyFullscreen(next);
    return next;
  } catch (e) {
    console.warn("[windowMode] toggleFullscreen failed", e);
    return null;
  }
}
