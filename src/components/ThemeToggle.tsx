import { useAppStore } from "../store/useAppStore";
import type { ThemeMode } from "../services/theme";

export function ThemeToggle({ showLabels = false }: { showLabels?: boolean }) {
  const theme = useAppStore((s) => s.prefs.theme);
  const setTheme = useAppStore((s) => s.setTheme);

  const pick = (next: ThemeMode) => {
    if (next !== theme) setTheme(next);
  };

  return (
    <div
      className="theme-toggle"
      role="group"
      aria-label="Appearance"
      title="Appearance"
    >
      <button
        type="button"
        className={`theme-toggle-btn${theme === "dark" ? " is-active" : ""}`}
        aria-pressed={theme === "dark"}
        aria-label="Dark mode"
        onClick={() => pick("dark")}
      >
        <span className="theme-ico" aria-hidden="true">
          ◐
        </span>
        {showLabels ? "Dark" : null}
      </button>
      <button
        type="button"
        className={`theme-toggle-btn${theme === "light" ? " is-active" : ""}`}
        aria-pressed={theme === "light"}
        aria-label="Light mode"
        onClick={() => pick("light")}
      >
        <span className="theme-ico" aria-hidden="true">
          ◔
        </span>
        {showLabels ? "Light" : null}
      </button>
    </div>
  );
}
