/**
 * In-game overlay control — prefs bridge to Rust (show/hide is Rust-driven).
 */
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./appUpdater";

export async function setOverlayEnabled(enabled: boolean): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke("overlay_set_enabled", { enabled });
  } catch {
    /* command unavailable in browser / older builds */
  }
}

export async function syncOverlayPrefFromStore(enabled: boolean): Promise<void> {
  await setOverlayEnabled(enabled);
}
