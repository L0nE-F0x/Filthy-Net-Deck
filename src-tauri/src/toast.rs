//! Always-on-top alert window.
//!
//! Windows refuses to draw OS notification banners while a game is running or
//! while any app is fullscreen — the "Turn on do not disturb automatically"
//! rules are on by default, and an app cannot opt out of them. The toast still
//! queues in the notification centre, which is useless mid-match.
//!
//! So every alert is *also* painted into this borderless top-most window,
//! which sits above borderless-fullscreen Arena and above our own fullscreen
//! main window. It is click-through (never steals a click from Arena), never
//! focused, and hides itself after the linger window.
//!
//! Separate from the HUD `overlay` window on purpose: that one carries
//! user-owned geometry, collapse state and an enabled toggle tied to matches.

use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

const TOAST_LABEL: &str = "toast";
const ENABLED_FILE: &str = "toast-window-enabled";
const TOAST_EVENT: &str = "fnd:toast";

const W: f64 = 344.0;
const H: f64 = 104.0;
/// Gap from the working-area corner, matching the OS banner inset.
const MARGIN: f64 = 16.0;
/// How long a toast stays up. Long enough to read between Arena turns.
const LINGER_MS: u64 = 7_000;

static ENABLED: AtomicBool = AtomicBool::new(true);
/// Bumped per toast so a stale hide timer never closes a newer toast.
static GENERATION: AtomicU64 = AtomicU64::new(0);
/// The toast in flight. The very first alert builds the webview, so the event
/// is emitted before that webview can subscribe — it pulls this on mount.
static PENDING: Mutex<Option<(ToastPayload, Instant)>> = Mutex::new(None);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToastPayload {
    title: String,
    body: String,
    linger_ms: u64,
}

fn enabled_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join(ENABLED_FILE))
}

/// Load the persisted toggle at startup (default on — matches the UI pref).
pub fn load_enabled(app: &AppHandle) {
    let on = enabled_path(app)
        .and_then(|p| fs::read_to_string(p).ok())
        .map(|s| {
            let t = s.trim();
            t != "0" && !t.eq_ignore_ascii_case("false")
        })
        .unwrap_or(true);
    ENABLED.store(on, Ordering::SeqCst);
}

pub fn is_enabled() -> bool {
    ENABLED.load(Ordering::SeqCst)
}

fn set_enabled(app: &AppHandle, enabled: bool) {
    ENABLED.store(enabled, Ordering::SeqCst);
    if let Some(path) = enabled_path(app) {
        if let Some(dir) = path.parent() {
            let _ = fs::create_dir_all(dir);
        }
        let _ = fs::write(path, if enabled { b"1" as &[u8] } else { b"0" });
    }
    if !enabled {
        hide(app);
    }
}

/// Top-right of the primary monitor, in logical px. Falls back to the OS
/// default position when no monitor is reported (headless / RDP races).
fn corner_position(app: &AppHandle) -> Option<(f64, f64)> {
    let m = app.primary_monitor().ok().flatten()?;
    let f = m.scale_factor().max(0.5);
    let mx = m.position().x as f64 / f;
    let my = m.position().y as f64 / f;
    let mw = m.size().width as f64 / f;
    Some((mx + mw - W - MARGIN, my + MARGIN))
}

fn ensure_window(app: &AppHandle) -> Result<(), String> {
    if app.get_webview_window(TOAST_LABEL).is_some() {
        return Ok(());
    }
    let url = WebviewUrl::App("index.html#/toast".into());
    let builder = WebviewWindowBuilder::new(app, TOAST_LABEL, url)
        .title("Filthy Net Deck — Alert")
        .inner_size(W, H)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .focused(false);

    // `transparent` is Windows/Linux-only in Tauri 2 — calling it on macOS
    // breaks the dmg build (same trap as the overlay window).
    #[cfg(not(target_os = "macos"))]
    let builder = builder.transparent(true);

    let builder = match corner_position(app) {
        Some((x, y)) => builder.position(x, y),
        None => builder,
    };

    let win = builder.build().map_err(|e| e.to_string())?;
    // Never eat a click meant for Arena.
    let _ = win.set_ignore_cursor_events(true);
    Ok(())
}

/// Build the toast webview at startup so no alert ever pays for it.
///
/// Belt and braces with the ordering in [`show_toast`]: with the window
/// already up, `ensure_window` is a cheap early return on every alert, and
/// the very first toast of a session behaves like all the others.
pub fn prewarm(app: &AppHandle) {
    if let Err(e) = ensure_window(app) {
        eprintln!("[toast] prewarm: {e}");
    }
}

pub fn hide(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(TOAST_LABEL) {
        let _ = win.hide();
    }
}

/// Paint `title`/`body` in the top-most window for [`LINGER_MS`].
///
/// Safe to call from the tracker thread: window work is hopped onto the main
/// thread, and the hide timer runs on its own thread.
pub fn show_toast(app: &AppHandle, title: &str, body: &str) {
    if !is_enabled() {
        return;
    }
    let gen = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let payload = ToastPayload {
        title: title.to_string(),
        body: body.to_string(),
        linger_ms: LINGER_MS,
    };
    if let Ok(mut slot) = PENDING.lock() {
        *slot = Some((payload.clone(), Instant::now()));
    }

    // Build the webview *before* hopping to the main thread. Creating a
    // window from inside a `run_on_main_thread` callback deadlocks the event
    // loop on Windows: the window is created but `build()` never returns, so
    // the toast is never shown *and* every later main-thread task is wedged
    // behind it — including the tray menu's `app.exit(0)`. That is why the
    // first alert of a session silently did nothing and Quit stopped working.
    if let Err(e) = ensure_window(app) {
        eprintln!("[toast] ensure_window: {e}");
        return;
    }

    let app_show = app.clone();
    let _ = app.run_on_main_thread(move || {
        // Re-corner every time: the monitor layout may have changed since the
        // window was built (laptop undocked, resolution switch).
        if let Some(win) = app_show.get_webview_window(TOAST_LABEL) {
            if let Some((x, y)) = corner_position(&app_show) {
                let _ = win.set_position(tauri::LogicalPosition::new(x, y));
            }
            let _ = win.show();
            // Re-assert: another top-most window may have taken the layer.
            let _ = win.set_always_on_top(true);
            // Do not set_focus — Arena must keep input.
        }
        let _ = app_show.emit_to(TOAST_LABEL, TOAST_EVENT, payload);
    });

    let app_hide = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(LINGER_MS + 350));
        // A newer toast reused the window — let its own timer close it.
        if GENERATION.load(Ordering::SeqCst) != gen {
            return;
        }
        let target = app_hide.clone();
        let _ = app_hide.run_on_main_thread(move || hide(&target));
    });
}

/// Mirror of the Settings → Notifications → "Show alerts over Arena" toggle.
#[tauri::command]
pub fn toast_set_enabled(app: AppHandle, enabled: bool) {
    set_enabled(&app, enabled);
}

/// Frontend-originated alerts (Set Radar, B&R, meta movers, test toast) so
/// they clear fullscreen the same way match-end does.
#[tauri::command]
pub fn toast_show(app: AppHandle, title: String, body: String) {
    show_toast(&app, &title, &body);
}

/// The alert still inside its linger window, with the remaining time. The
/// toast webview calls this once on mount so the *first* alert — the one that
/// built the webview, and so missed the event — still paints.
#[tauri::command]
pub fn toast_pending() -> Option<ToastPayload> {
    let slot = PENDING.lock().ok()?;
    let (payload, at) = slot.as_ref()?;
    let elapsed = at.elapsed().as_millis() as u64;
    let left = payload.linger_ms.checked_sub(elapsed)?;
    Some(ToastPayload {
        linger_ms: left,
        ..payload.clone()
    })
}
