import { useEffect, useMemo, useState, type ReactNode } from "react";
import { nextArenaDropInDays } from "./services/setPulse";
import { useAppStore } from "./store/useAppStore";
import { Daily } from "./pages/Daily";
import { FormatView } from "./pages/FormatView";
import { DeckView } from "./pages/DeckView";
import { MetaPulse } from "./pages/MetaPulse";
import { Stats } from "./pages/Stats";
import { Matchups } from "./pages/Matchups";
import { Climb } from "./pages/Climb";
import { Settings } from "./pages/Settings";
import { BoModeToggle } from "./components/BoModeToggle";
import { CommandPalette } from "./components/CommandPalette";
import { ThemeToggle } from "./components/ThemeToggle";
import { StatusBanners } from "./components/StatusBanners";
import { SplashScreen } from "./components/SplashScreen";
import {
  IconDaily,
  IconMeta,
  IconSettings,
  IconStats,
  IconMatchups,
  IconClimb,
  IconSets,
} from "./components/NavIcons";
import type { Page } from "./types/meta";
import { APP_VERSION } from "./version";
import { openExternal } from "./services/openExternal";
import { applyFullscreen, closeToTray, toggleFullscreen } from "./services/windowMode";
import { isTauri } from "./services/appUpdater";
import { Sets } from "./pages/Sets";

const NAV: {
  id: Page;
  label: string;
  icon: (p: { className?: string }) => ReactNode;
}[] = [
  { id: "daily", label: "Decks", icon: IconDaily },
  { id: "meta", label: "Events", icon: IconMeta },
  { id: "sets", label: "Sets", icon: IconSets },
  { id: "stats", label: "My Stats", icon: IconStats },
  { id: "matchups", label: "Matchups", icon: IconMatchups },
  { id: "climb", label: "Climb", icon: IconClimb },
  { id: "settings", label: "Settings", icon: IconSettings },
];

/** Pages that work offline / without a meta download. */
const LOCAL_PAGES: Page[] = ["settings", "stats", "matchups", "climb", "sets"];

function pageTitle(page: Page): string {
  switch (page) {
    case "daily":
      return "Decks";
    case "format":
      return "Format";
    case "deck":
      return "Deck";
    case "meta":
      return "Events";
    case "sets":
      return "Sets";
    case "stats":
      return "My Stats";
    case "matchups":
      return "Matchup Lab";
    case "climb":
      return "Climb Tracker";
    case "settings":
      return "Settings";
    default:
      return "Filthy Net Deck";
  }
}

function feedLabel(status: string | null): string {
  if (status === "live") return "live";
  if (status === "cached") return "cached";
  return "—";
}

export default function App() {
  const page = useAppStore((s) => s.page);
  const setPage = useAppStore((s) => s.setPage);
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const refreshMeta = useAppStore((s) => s.refreshMeta);
  const meta = useAppStore((s) => s.meta);
  const loading = useAppStore((s) => s.loading);
  const error = useAppStore((s) => s.error);
  const clearError = useAppStore((s) => s.clearError);
  const feedStatus = useAppStore((s) => s.feedStatus);
  const lastRefresh = useAppStore((s) => s.lastRefresh);
  const initTracker = useAppStore((s) => s.initTracker);
  const sets = useAppStore((s) => s.sets);
  const [bootDone, setBootDone] = useState(false);
  const fullscreen = useAppStore((s) => s.prefs.fullscreen);

  // Small countdown chip on the Sets nav item (14-day window, like the pulse).
  const arenaDropIn = useMemo(() => {
    const d = nextArenaDropInDays(sets);
    return d != null && d <= 14 ? d : null;
  }, [sets]);

  useEffect(() => {
    void initTracker();
    void refreshMeta().finally(() => setBootDone(true));
    if (useAppStore.getState().prefs.fullscreen) void applyFullscreen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // F11 toggles fullscreen (and remembers the choice for next launch).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F11") return;
      e.preventDefault();
      void toggleFullscreen().then((now) => {
        if (now != null) useAppStore.getState().setFullscreenPref(now);
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Keyboard shortcuts 1–7 jump to main nav pages (Milestone 6).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }
      const idx = Number(e.key) - 1;
      if (idx >= 0 && idx < NAV.length) {
        e.preventDefault();
        setPage(NAV[idx].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPage]);

  // No manual Refresh button: the app syncs itself — on launch, on focus or
  // hourly when the copy is >90 min old, and immediately when connectivity
  // returns. The published feed only changes when the daily pipeline runs.
  useEffect(() => {
    const syncIfStale = () => {
      if (!loading && lastRefresh) {
        const age = Date.now() - new Date(lastRefresh).getTime();
        if (age > 90 * 60 * 1000) void refreshMeta();
      }
    };
    const onOnline = () => {
      if (!loading) void refreshMeta();
    };
    window.addEventListener("focus", syncIfStale);
    window.addEventListener("online", onOnline);
    const timer = window.setInterval(syncIfStale, 60 * 60 * 1000);
    return () => {
      window.removeEventListener("focus", syncIfStale);
      window.removeEventListener("online", onOnline);
      window.clearInterval(timer);
    };
  }, [lastRefresh, loading, refreshMeta]);

  return (
    <SplashScreen ready={bootDone}>
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/app-icon.png" alt="" width={36} height={36} />
          <div>
            <strong>Filthy Net Deck</strong>
            <small>MTG Arena · v{APP_VERSION}</small>
          </div>
        </div>
        {NAV.map((item) => {
          const active =
            (item.id === "daily" &&
              (page === "daily" || page === "format" || page === "deck")) ||
            (item.id !== "daily" && page === item.id);
          return (
            <button
              key={item.id}
              type="button"
              className={`nav-btn${active ? " active" : ""}`}
              onClick={() => setPage(item.id)}
            >
              <item.icon />
              {item.label}
              {item.id === "sets" && arenaDropIn != null && (
                <span
                  className="nav-badge"
                  title={
                    arenaDropIn === 0
                      ? "A set hits Arena today"
                      : `Next Arena set drop in ${arenaDropIn} day${arenaDropIn === 1 ? "" : "s"}`
                  }
                >
                  {arenaDropIn === 0 ? "now" : `${arenaDropIn}d`}
                </span>
              )}
            </button>
          );
        })}
        <div className="mt-auto pt-4 px-1 flex flex-col gap-1.5">
          <p className="text-[10px] text-muted leading-relaxed m-0">
            Not affiliated with Wizards of the Coast.
          </p>
          <p className="text-[10px] text-muted leading-relaxed m-0">
            Built by{" "}
            <button
              type="button"
              className="text-gold-300 hover:text-gold-200 underline-offset-2 hover:underline bg-transparent border-0 p-0 cursor-pointer font-semibold text-[10px]"
              onClick={() => void openExternal("https://ame-apexforge.org/")}
            >
              ApexForge
            </button>
          </p>
        </div>
      </aside>

      <div className="main-pane">
        <header className="topbar">
          <div>
            <h1>{pageTitle(page)}</h1>
            <p className="meta-line">
              {meta ? (
                <>
                  <span className={`feed-dot ${feedStatus ?? ""}`} />
                  Meta {meta.date} · {feedLabel(feedStatus)}
                </>
              ) : loading ? (
                "Loading meta…"
              ) : (
                "No meta loaded"
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {(page === "daily" || page === "format" || page === "deck") && (
              <BoModeToggle mode={mode} onChange={setMode} />
            )}
            <ThemeToggle />
            <button
              type="button"
              className="palette-hint"
              title="Search cards, decks, pages"
              aria-label="Open card watch search (Control K)"
              onClick={() =>
                window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))
              }
            >
              <kbd>Ctrl</kbd>
              <kbd>K</kbd>
            </button>
          </div>
        </header>

        <StatusBanners />

        <CommandPalette />

        {error && (
          <div className="mx-5 mt-2 px-3 py-2 rounded-lg bg-poor/10 border border-poor/30 text-sm text-poor flex justify-between gap-2">
            <span>{error}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={clearError}>
              Dismiss
            </button>
          </div>
        )}

        <main className="content" key={page}>
          {!meta && !loading && !LOCAL_PAGES.includes(page) ? (
            <div className="empty-state">
              <h2 className="text-lg font-semibold m-0 mb-2">No deck data available</h2>
              <p className="text-sm text-muted max-w-md mx-auto leading-relaxed">
                This app only shows real, verified meta data — there is no built-in placeholder
                pack. Connect to the internet and it will download today’s lists automatically.
              </p>
              <button
                type="button"
                className="btn btn-primary mt-4"
                onClick={() => void refreshMeta()}
              >
                Retry download
              </button>
            </div>
          ) : (
            <>
              {page === "daily" && <Daily />}
              {page === "format" && <FormatView />}
              {page === "deck" && <DeckView />}
              {page === "meta" && <MetaPulse />}
              {page === "sets" && <Sets />}
              {page === "stats" && <Stats />}
              {page === "matchups" && <Matchups />}
              {page === "climb" && <Climb />}
              {page === "settings" && <Settings />}
            </>
          )}
        </main>
      </div>

      {fullscreen && isTauri() && (
        <div className="fs-controls" role="toolbar" aria-label="Fullscreen window controls">
          <button
            type="button"
            className="fs-btn"
            title="Exit fullscreen (F11)"
            onClick={() =>
              void toggleFullscreen().then((now) => {
                if (now != null) useAppStore.getState().setFullscreenPref(now);
              })
            }
          >
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
              <path
                d="M5.5 1.5v4h-4M10.5 1.5v4h4M5.5 14.5v-4h-4M10.5 14.5v-4h4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Exit fullscreen
          </button>
          <button
            type="button"
            className="fs-btn"
            title="Close to system tray — the tracker keeps running"
            onClick={() => void closeToTray()}
          >
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
              <path
                d="M3 3l10 10M13 3L3 13"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
            Close to tray
          </button>
        </div>
      )}
    </div>
    </SplashScreen>
  );
}
