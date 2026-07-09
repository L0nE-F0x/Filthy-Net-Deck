import { useEffect, type ReactNode } from "react";
import { useAppStore } from "./store/useAppStore";
import { Daily } from "./pages/Daily";
import { FormatView } from "./pages/FormatView";
import { DeckView } from "./pages/DeckView";
import { MetaPulse } from "./pages/MetaPulse";
import { Settings } from "./pages/Settings";
import { BoModeToggle } from "./components/BoModeToggle";
import { StatusBanners } from "./components/StatusBanners";
import { ResultViewer } from "./components/ResultViewer";
import { IconDaily, IconMeta, IconSettings, IconQueue } from "./components/NavIcons";
import type { Page } from "./types/meta";
import { APP_VERSION } from "./version";

const NAV: {
  id: Page;
  label: string;
  icon: (p: { className?: string }) => ReactNode;
}[] = [
  { id: "daily", label: "Daily", icon: IconDaily },
  { id: "meta", label: "Meta Pulse", icon: IconMeta },
  { id: "settings", label: "Settings", icon: IconSettings },
];

function pageTitle(page: Page): string {
  switch (page) {
    case "daily":
      return "Daily decks";
    case "format":
      return "Format";
    case "deck":
      return "Deck";
    case "meta":
      return "Meta Pulse";
    case "settings":
      return "Settings";
    default:
      return "Filthy Net Deck";
  }
}

function feedLabel(status: string | null): string {
  if (status === "live") return "live";
  if (status === "cached") return "cached";
  if (status === "offline") return "offline pack";
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
  const favorites = useAppStore((s) => s.favorites);
  const setShowFavoritesOnly = useAppStore((s) => s.setShowFavoritesOnly);

  useEffect(() => {
    if (!meta && !loading) {
      void refreshMeta();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onFocus = () => {
      if (!loading && lastRefresh) {
        const age = Date.now() - new Date(lastRefresh).getTime();
        if (age > 90 * 60 * 1000) void refreshMeta();
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [lastRefresh, loading, refreshMeta]);

  return (
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
            page === item.id ||
            (item.id === "daily" && (page === "format" || page === "deck"));
          return (
            <button
              key={item.id}
              type="button"
              className={`nav-btn${active ? " active" : ""}`}
              onClick={() => setPage(item.id)}
            >
              <item.icon />
              {item.label}
            </button>
          );
        })}
        <button
          type="button"
          className="nav-btn"
          onClick={() => {
            setShowFavoritesOnly(true);
            setPage("daily");
          }}
        >
          <IconQueue />
          My queue
          {favorites.length > 0 && (
            <span className="ml-auto text-[10px] text-gold-400">{favorites.length}</span>
          )}
        </button>
        <div className="mt-auto pt-4 px-1">
          <p className="text-[10px] text-muted leading-relaxed m-0">
            Not affiliated with Wizards of the Coast.
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
          <div className="flex items-center gap-3">
            {(page === "daily" || page === "format" || page === "deck") && (
              <BoModeToggle mode={mode} onChange={setMode} />
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={loading}
              onClick={() => void refreshMeta()}
            >
              {loading ? "…" : "Refresh"}
            </button>
          </div>
        </header>

        <StatusBanners />

        {error && (
          <div className="mx-5 mt-2 px-3 py-2 rounded-lg bg-poor/10 border border-poor/30 text-sm text-poor flex justify-between gap-2">
            <span>{error}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={clearError}>
              Dismiss
            </button>
          </div>
        )}

        <main className="content" key={page}>
          {page === "daily" && <Daily />}
          {page === "format" && <FormatView />}
          {page === "deck" && <DeckView />}
          {page === "meta" && <MetaPulse />}
          {page === "settings" && <Settings />}
        </main>
      </div>

      <ResultViewer />
    </div>
  );
}
