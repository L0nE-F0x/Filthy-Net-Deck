export type ThemeMode = "dark" | "light";

const ATTR = "data-theme";

/** Apply theme to the document root. Dark is the default (no attribute). */
export function applyTheme(theme: ThemeMode): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "light") {
    root.setAttribute(ATTR, "light");
  } else {
    root.removeAttribute(ATTR);
  }
}

/**
 * Read theme from localStorage prefs before React mounts so the first paint
 * doesn't flash the wrong palette.
 */
export function bootThemeFromStorage(): ThemeMode {
  try {
    const raw = localStorage.getItem("bbi.prefs");
    if (raw) {
      const parsed = JSON.parse(raw) as { theme?: string };
      if (parsed.theme === "light") {
        applyTheme("light");
        return "light";
      }
    }
  } catch {
    /* ignore */
  }
  applyTheme("dark");
  return "dark";
}
