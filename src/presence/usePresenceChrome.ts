import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { bootThemeFromStorage } from "../services/theme";
import { isTauri } from "../services/appUpdater";
import {
  PREFS_KEY,
  readOverlayPrefs,
  writeOverlayPrefs,
  type OverlayPrefs,
} from "../overlay/overlayPrefs";
import { applyLocalePref, readLocalePref } from "../i18n";

/**
 * Shared boot for the presence badge and its cog-menu window: overlay chrome
 * classes, theme, and the overlay-prefs blob both surfaces edit.
 */
export function usePresenceChrome(): {
  prefs: OverlayPrefs;
  patch: (p: Record<string, unknown>) => void;
} {
  const [prefs, setPrefs] = useState<OverlayPrefs>(() => readOverlayPrefs());

  useEffect(() => {
    bootThemeFromStorage();
    document.documentElement.classList.add("overlay-root");
    document.body.classList.add("overlay-body");
    if (/Mac OS X|Macintosh/.test(navigator.userAgent)) {
      document.documentElement.classList.add("overlay-macos");
    }
    return () => {
      document.documentElement.classList.remove("overlay-root");
      document.body.classList.remove("overlay-body");
      document.documentElement.classList.remove("overlay-macos");
    };
  }, []);

  useEffect(() => {
    let unlistenPrefs: (() => void) | undefined;
    let cancelled = false;

    const onStorage = (e: StorageEvent) => {
      if (e.key !== PREFS_KEY) return;
      setPrefs(readOverlayPrefs());
      applyLocalePref(readLocalePref());
    };
    window.addEventListener("storage", onStorage);

    void (async () => {
      if (!isTauri()) return;
      try {
        unlistenPrefs = await listen("prefs:overlay", () => {
          if (cancelled) return;
          setPrefs(readOverlayPrefs());
          applyLocalePref(readLocalePref());
        });
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
      unlistenPrefs?.();
    };
  }, []);

  const patch = useCallback((p: Record<string, unknown>) => {
    writeOverlayPrefs(p);
    setPrefs(readOverlayPrefs());
  }, []);

  return { prefs, patch };
}
