/**
 * In-game overlay control — prefs bridge to Rust (show/hide is Rust-driven).
 * Also carries the match-end toast toggle to the tracker thread.
 */
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { isTauri } from "./appUpdater";

export async function setOverlayEnabled(enabled: boolean): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke("overlay_set_enabled", { enabled });
  } catch {
    /* command unavailable in browser / older builds */
  }
}

/** Post-match summary card in the overlay (Rust owns the linger window). */
export async function setOverlayPostMatch(enabled: boolean): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke("overlay_set_post_match", { enabled });
  } catch {
    /* command unavailable in browser / older builds */
  }
}

/**
 * Mirror the match-end toast toggle to Rust — the tracker thread posts the
 * toast itself so it lands while the main window is tray-hidden mid-game.
 */
export async function setNotifyMatchEndRust(enabled: boolean): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke("notify_set_match_end", { enabled });
  } catch {
    /* command unavailable in browser / older builds */
  }
}

/** Corner presence badge while Arena is open (Rust owns show/hide). */
export async function setPresenceEnabled(enabled: boolean): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke("presence_set_enabled", { enabled });
  } catch {
    /* command unavailable in browser / older builds */
  }
}

/**
 * Broadcast an overlay-prefs change to every window. The overlay webview is
 * persistent and the DOM `storage` event is not guaranteed to reach it across
 * WebView2 windows — this Tauri event is the reliable path (the overlay keeps
 * its `storage` listener as fallback).
 */
export async function pushOverlayPrefs(): Promise<void> {
  if (!isTauri()) return;
  try {
    await emit("prefs:overlay");
  } catch {
    /* command unavailable in browser / older builds */
  }
}

export async function syncOverlayPrefFromStore(enabled: boolean): Promise<void> {
  await setOverlayEnabled(enabled);
}
