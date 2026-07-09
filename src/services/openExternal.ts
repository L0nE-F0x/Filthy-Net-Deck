/**
 * Open a URL with the system browser / download handler.
 * Uses Tauri opener when available; falls back to window.open in the browser.
 */
export async function openExternal(url: string): Promise<void> {
  if (!url) return;
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
    return;
  } catch {
    // Not in Tauri, or opener unavailable
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

/** Start installer download (same as openExternal — OS handles .exe save). */
export async function downloadInstaller(url: string): Promise<void> {
  return openExternal(url);
}
