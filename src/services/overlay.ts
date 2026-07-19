/**
 * In-game overlay control — prefs bridge to Rust (show/hide is Rust-driven).
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
