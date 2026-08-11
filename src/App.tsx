import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
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
import { Sets } from "./pages/Sets";
import { FormatHubPage } from "./pages/FormatHub";
import { BrewLab } from "./pages/BrewLab";
import { BoModeToggle } from "./components/BoModeToggle";
import { CommandPalette } from "./components/CommandPalette";
import { ThemeToggle } from "./components/ThemeToggle";
import { PlaneswalkerThemes } from "./components/PlaneswalkerThemes";
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
  IconFormatHub,
  IconBrewLab,
  IconHelp,
} from "./components/NavIcons";
import type { Page } from "./types/meta";
import { APP_VERSION } from "./version";
import { openExternal } from "./services/openExternal";
import { applyFullscreen, closeToTray } from "./services/windowMode";
import { isTauri } from "./services/appUpdater";
import { syncOverlayPrefFromStore } from "./services/overlay";
import { HelpGuide } from "./components/HelpGuide";
import { listen } from "@tauri-apps/api/event";

/*
 * Pages are imported statically on purpose.
 *
 * v2.7.2 split them behind `React.lazy` + `Suspense`, then prefetched every
 * chunk on idle — so nothing was ever actually deferred, while `lazy` still
 * renders its fallback once before resolving. Net effect: a skeleton flashed on
 * the first visit to every page, forever, in exchange for no saved bytes
 * (measured: all page chunks downloaded ~1.2s after boot regardless).
 *
 * The split that *does* pay is in `main.tsx`, which lazy-loads App vs. the
 * overlay / toast / presence roots — that keeps the whole main app out of the
 * three secondary WebView2 renderers. Pages live inside the App chunk either
 * way, and all of them together are ~250KB served from local disk.
 */

function navigateTo(page: Page) {
  useAppStore.getState().setPage(page);
}

/** Nav order: Decks → personal loop → Brew Lab → world → Settings. Keys 1–9. */
const NAV: {
  id: Page;
  label: string;
  icon: (p: { className?: string }) => ReactNode;
}[] = [
  { id: "daily", label: "Decks", icon: IconDaily },
  { id: "stats", label: "My Stats", icon: IconStats },
  { id: "climb", label: "Climb", icon: IconClimb },
  { id: "matchups", label: "Matchups", icon: IconMatchups },
  { id: "brewlab", label: "Brew Lab", icon: IconBrewLab },
  { id: "sets", label: "Sets", icon: IconSets },
  { id: "formats", label: "Format Hub", icon: IconFormatHub },
  { id: "meta", label: "Events", icon: IconMeta },
  { id: "settings", label: "Settings", icon: IconSettings },
];

/** Pages that work offline / without a meta download. */
const LOCAL_PAGES: Page[] = [
  "settings",
  "stats",
  "matchups",
  "climb",
  "brewlab",
  "sets",
  "formats",
];

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
      return "Matchups";
    case "climb":
      return "Climb Tracker";
    case "brewlab":
      return "Brew Lab";
    case "formats":
      return "Format Hub";
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
  const contentRef = useRef<HTMLElement>(null);

  // Page-change fade. `.content` is deliberately un-keyed (remounting it reset
  // in-page state on every nav click), so restart the animation by hand instead
  // of relying on a mount. Opacity only — no transform, no composite churn.
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    el.classList.remove("content-enter");
    // Force reflow so removing + re-adding actually restarts the animation.
    void el.offsetWidth;
    el.classList.add("content-enter");
  }, [page]);

  // Small countdown chip on the Sets nav item (14-day window, like the pulse).
  const arenaDropIn = useMemo(() => {
    const d = nextArenaDropInDays(sets);
    return d != null && d <= 14 ? d : null;
  }, [sets]);

  useEffect(() => {
    void initTracker();
    void refreshMeta().finally(() => setBootDone(true));
    // Local-only open-day counter (retention; never uploaded).
    void import("./services/localRetention").then((m) => m.recordAppOpen());
    if (useAppStore.getState().prefs.fullscreen) void applyFullscreen(true);
    // Overlay enable flag is owned by Rust (tray can toggle while main is hidden).
    // Pull that flag first, then mirror into prefs so Settings stays honest.
    void (async () => {
      try {
        const rustOn = await invoke<boolean>("overlay_is_enabled");
        const local = useAppStore.getState().prefs.overlayEnabled;
        if (rustOn !== local) {
          useAppStore.getState().setOverlayEnabled(rustOn);
        } else {
          await syncOverlayPrefFromStore(local);
        }
      } catch {
        await syncOverlayPrefFromStore(
          useAppStore.getState().prefs.overlayEnabled,
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore the signed-in user from the stored session, then follow it.
  //
  // Without this the app looks signed out after every launch *and* every
  // webview reload, because the store starts at `authName: null` and only the
  // deep link ever filled it in — so the user signed in again to fix something
  // that was never actually broken. The session itself was always on disk in
  // `auth.json`; nothing asked it who was there.
  //
  // The subscription covers the rest of the window's life: token refreshes,
  // sign-out, and the deep-link sign-in all land here, so no surface has to
  // remember to update the store by hand.
  useEffect(() => {
    if (!isTauri()) return;
    void useAppStore.getState().refreshAuth();
    let un: (() => void) | undefined;
    void import("./services/cloud/auth").then(async (m) => {
      un = await m.onAuthChange((user) => {
        useAppStore.setState({ authName: m.displayNameFor(user) });
      });
    });
    return () => un?.();
  }, []);

  // OAuth callback. Rust forwards every `fnd://` URL here (from a cold start
  // or, more commonly, via the single-instance hook when the app was already
  // running). Only auth links are consumed, so future `fnd://` routes can be
  // added without disturbing this one.
  useEffect(() => {
    if (!isTauri()) return;
    let un: (() => void) | undefined;
    void listen<string>("deep-link", (e) => {
      const url = String(e.payload ?? "");
      void import("./services/cloud/auth").then(async (m) => {
        if (!m.isAuthDeepLink(url)) return;
        const result = await m.completeSignIn(url);
        useAppStore.getState().setAuthResult(result);
      });
    }).then((f) => {
      un = f;
    });
    return () => un?.();
  }, []);

  // Opt-in match sharing. Fires once after boot to drain any backlog, then
  // after each recorded match. Both are no-ops unless signed in AND opted in
  // (gated inside uploadNewMatches), and neither can surface an error in the
  // app — a backend problem just means the next trigger retries.
  useEffect(() => {
    if (!bootDone || !isTauri()) return;
    const t = window.setTimeout(() => {
      void import("./services/cloud/syncRunner").then((m) => m.syncMatchesNow());
    }, 12_000);
    return () => window.clearTimeout(t);
  }, [bootDone]);

  useEffect(() => {
    if (!isTauri()) return;
    let un: (() => void) | undefined;
    let debounce = 0;
    void listen("tracker:match", () => {
      // A Bo3 can emit in quick succession; coalesce rather than uploading
      // once per game-end event.
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        void import("./services/cloud/syncRunner").then((m) => m.syncMatchesNow());
      }, 5_000);
    }).then((f) => {
      un = f;
    });
    return () => {
      window.clearTimeout(debounce);
      un?.();
    };
  }, []);

  // Opt-in health ping, at most once a day. Waits for boot so the tracker
  // status it reports is real, and is deliberately fire-and-forget — a backend
  // outage must never be visible in the app. See docs/BACKEND-PHASE-2.md §7.1.
  useEffect(() => {
    if (!bootDone) return;
    const t = window.setTimeout(() => {
      const s = useAppStore.getState();
      if (!s.prefs.healthPing) return;
      void import("./services/cloud/healthPing").then((m) =>
        m.maybeSendHealthPing({
          enabled: true,
          status: s.trackerStatus,
          matches: s.trackerMatches,
        }),
      );
    }, 8000);
    return () => window.clearTimeout(t);
  }, [bootDone]);

  // Tracker recovery: while the window is hidden in the tray, WebView can miss
  // live `tracker:match` events even though Rust is still writing matches to
  // disk. Re-pull from Rust whenever we become visible/focused, and poll lightly.
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    const pull = () => {
      if (!cancelled) void useAppStore.getState().refreshTracker();
    };

    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      pull();
      // hide_to_tray drops OS fullscreen so Windows will actually hide; put it
      // back when the user reopens from the tray if they still prefer fullscreen.
      if (useAppStore.getState().prefs.fullscreen) void applyFullscreen(true);
    };
    const onFocus = () => pull();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);

    // Safety net if focus events are flaky after tray restore.
    // Tighter poll while the window is visible so tray-missed matches catch up faster.
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") pull();
    }, 12_000);

    let unFocus: (() => void) | undefined;
    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        unFocus = await getCurrentWindow().onFocusChanged(({ payload: focused }) => {
          if (focused) pull();
        });
      } catch {
        /* browser / API unavailable */
      }
    })();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
      window.clearInterval(poll);
      unFocus?.();
    };
  }, []);

  // The overlay's quick-settings pill writes the shared prefs blob directly
  // and emits `prefs:overlay` — mirror those edits back into this window's
  // store so Settings sliders/toggles stay honest without a restart.
  useEffect(() => {
    if (!isTauri()) return;
    let un: (() => void) | undefined;
    void listen("prefs:overlay", () => {
      useAppStore.getState().reloadPrefs();
    }).then((u) => {
      un = u;
    });
    return () => un?.();
  }, []);

  // F11 toggles fullscreen (and remembers the choice for next launch).
  // Prefs are the source of truth — isFullscreen() can desync after tray hide
  // or a failed OS fullscreen call, which made Exit look dead.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F11") return;
      e.preventDefault();
      const cur = useAppStore.getState().prefs.fullscreen;
      useAppStore.getState().setFullscreenPref(!cur);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Keyboard shortcuts 1–9 jump to main nav pages (order matches NAV).
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
        navigateTo(NAV[idx].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
              onClick={() => navigateTo(item.id)}
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
        <div className="sidebar-footer mt-auto pt-4 px-1 flex flex-col gap-1.5 min-w-0">
          <PlaneswalkerThemes />
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
          <div className="topbar-actions">
            {(page === "daily" || page === "format" || page === "deck") && (
              <BoModeToggle mode={mode} onChange={setMode} />
            )}
            {fullscreen && isTauri() && (
              <>
                <button
                  type="button"
                  className="fs-btn"
                  title="Exit fullscreen (F11)"
                  onClick={() => {
                    // Always exit — never toggle via isFullscreen(), which can
                    // desync from prefs and re-enter fullscreen instead.
                    useAppStore.getState().setFullscreenPref(false);
                  }}
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
              </>
            )}
            <ThemeToggle />
            <button
              type="button"
              className="fs-btn help-btn"
              title="Help & tour — what every page does"
              aria-label="Open help"
              onClick={() => useAppStore.getState().setHelpOpen(true)}
            >
              <IconHelp className="w-3.5 h-3.5" />
              Help
            </button>
            <button
              type="button"
              className="palette-hint"
              title="Search cards, decks, pages (Ctrl+K)"
              aria-label="Search cards, decks, and pages"
              onClick={() =>
                window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))
              }
            >
              <span className="palette-hint-ico" aria-hidden="true">
                ⌕
              </span>
              Search
            </button>
          </div>
        </header>

        <StatusBanners />

        <CommandPalette />

        <HelpGuide />

        {error && (
          <div className="mx-5 mt-2 px-3 py-2 rounded-lg bg-poor/10 border border-poor/30 text-sm text-poor flex justify-between gap-2">
            <span>{error}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={clearError}>
              Dismiss
            </button>
          </div>
        )}

        {/*
          No key={page}: remounting main dropped any in-page state on every nav
          click. Swap only the active child; the fade is restarted by the
          `content-enter` effect above.
        */}
        <main className="content" ref={contentRef}>
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
              {page === "brewlab" && <BrewLab />}
              {page === "formats" && <FormatHubPage />}
              {page === "settings" && <Settings />}
            </>
          )}
        </main>
      </div>

    </div>
    </SplashScreen>
  );
}
