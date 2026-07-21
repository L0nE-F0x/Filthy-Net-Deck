/**
 * The overlay prefs blob, shared by every webview that can edit it: the
 * in-match HUD (OverlayApp) and the corner presence badge (PresenceApp).
 *
 * Storage is the same-origin `bbi.prefs` localStorage entry the main window
 * owns. Writes broadcast `prefs:overlay` because the DOM `storage` event is
 * not guaranteed to cross WebView2 windows — every listener keeps `storage`
 * as a fallback.
 */
import { isTauri } from "../services/appUpdater";
import { normalizeDensity, normalizeOpacity, type OverlayDensity } from "./overlayModel";

/** localStorage prefs blob shared with the main window (same origin). */
export const PREFS_KEY = "bbi.prefs";

export interface OverlayPrefs {
  opacity: number;
  startExpanded: boolean;
  clickThrough: boolean;
  barClock: boolean;
  barRecord: boolean;
  postMatch: boolean;
  /** Row density of the expanded list — footprint knob (default compact). */
  density: OverlayDensity;
  /** Fade the panel quieter while the mouse is elsewhere (default on). */
  idleDim: boolean;
  /** Master switch for the in-match HUD. */
  overlayEnabled: boolean;
  /** Mirror alerts into the top-most card (survives fullscreen Arena). */
  notifyTopmost: boolean;
}

export function readOverlayPrefs(): OverlayPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        overlayOpacity?: number;
        overlayStartExpanded?: boolean;
        overlayClickThrough?: boolean;
        overlayBarClock?: boolean;
        overlayBarRecord?: boolean;
        overlayPostMatch?: boolean;
        overlayDensity?: string;
        overlayIdleDim?: boolean;
        overlayEnabled?: boolean;
        notifyTopmost?: boolean;
      };
      return {
        opacity: normalizeOpacity(parsed.overlayOpacity),
        startExpanded: parsed.overlayStartExpanded === true,
        clickThrough: parsed.overlayClickThrough === true,
        barClock: parsed.overlayBarClock !== false,
        barRecord: parsed.overlayBarRecord !== false,
        postMatch: parsed.overlayPostMatch !== false,
        density: normalizeDensity(parsed.overlayDensity),
        idleDim: parsed.overlayIdleDim !== false,
        overlayEnabled: parsed.overlayEnabled !== false,
        notifyTopmost: parsed.notifyTopmost !== false,
      };
    }
  } catch {
    /* ignore */
  }
  return {
    opacity: normalizeOpacity(undefined),
    startExpanded: false,
    clickThrough: false,
    barClock: true,
    barRecord: true,
    postMatch: true,
    density: normalizeDensity(undefined),
    idleDim: true,
    overlayEnabled: true,
    notifyTopmost: true,
  };
}

/**
 * Merge a patch into the shared blob and broadcast it. The emit is lightly
 * debounced — the opacity slider fires per pixel.
 */
let prefsEmitTimer = 0;
export function writeOverlayPrefs(patch: Record<string, unknown>): void {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    const obj = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    Object.assign(obj, patch);
    localStorage.setItem(PREFS_KEY, JSON.stringify(obj));
  } catch {
    /* ignore */
  }
  if (!isTauri()) return;
  window.clearTimeout(prefsEmitTimer);
  prefsEmitTimer = window.setTimeout(() => {
    void (async () => {
      try {
        const { emit } = await import("@tauri-apps/api/event");
        await emit("prefs:overlay");
      } catch {
        /* ignore */
      }
    })();
  }, 120);
}
