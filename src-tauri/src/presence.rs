//! Corner presence badge — "Filthy Net Deck is running", visible the whole
//! time Arena is open, not just during a match.
//!
//! Sits bottom-left of the primary monitor: the FND mark, a live dot, and a
//! cog for the overlay settings worth changing between matches. Distinct from
//! the `overlay` HUD on purpose — that one is match-scoped and the user drags
//! it wherever they like; this is a fixed, predictable anchor.
//!
//! Not click-through: the cog has to be clickable. So the window is sized to
//! exactly what the webview paints — it reports its own content box through
//! `presence_set_size` — and grows only while the cog menu is open.

use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder};

const PRESENCE_LABEL: &str = "presence";
const ENABLED_FILE: &str = "presence-enabled";

/// Starting size, replaced by the webview's own measurement on mount. This
/// window sits on top of Arena forever, so it must never block more pixels
/// than it actually paints — the webview reports its content box and we match
/// it exactly (see `presence_set_size`).
const W: f64 = 158.0;
const H: f64 = 40.0;
/// Clamps for the reported size, so a broken measurement can't cover Arena.
const MIN_W: f64 = 80.0;
const MAX_W: f64 = 420.0;
const MIN_H: f64 = 24.0;
const MAX_H: f64 = 620.0;
/// Gap from the working-area corner.
const MARGIN: f64 = 16.0;

static ENABLED: AtomicBool = AtomicBool::new(true);
/// Last height the webview asked for — `show()` re-corners against it.
static LAST_H: Mutex<f64> = Mutex::new(H);

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

/// Bottom-left of the primary monitor, in logical px, for a window `h` tall.
fn corner_position(app: &AppHandle, h: f64) -> Option<(f64, f64)> {
    let m = app.primary_monitor().ok().flatten()?;
    let f = m.scale_factor().max(0.5);
    let mx = m.position().x as f64 / f;
    let my = m.position().y as f64 / f;
    let mh = m.size().height as f64 / f;
    Some((mx + MARGIN, my + mh - h - MARGIN))
}

fn ensure_window(app: &AppHandle) -> Result<(), String> {
    if app.get_webview_window(PRESENCE_LABEL).is_some() {
        return Ok(());
    }
    let url = WebviewUrl::App("index.html#/presence".into());
    let builder = WebviewWindowBuilder::new(app, PRESENCE_LABEL, url)
        .title("Filthy Net Deck — Running")
        .inner_size(W, H)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .focused(false);

    // `transparent` is Windows/Linux-only in Tauri 2 — calling it on macOS
    // breaks the dmg build (see overlay.rs).
    #[cfg(not(target_os = "macos"))]
    let builder = builder.transparent(true);

    let builder = match corner_position(app, H) {
        Some((x, y)) => builder.position(x, y),
        None => builder,
    };

    builder.build().map_err(|e| e.to_string())?;
    Ok(())
}

/// Show iff the badge is enabled *and* Arena is actually up.
pub fn show(app: &AppHandle) {
    if !is_enabled() || !crate::arena::is_running() {
        return;
    }
    if let Err(e) = ensure_window(app) {
        eprintln!("[presence] ensure_window: {e}");
        return;
    }
    if let Some(win) = app.get_webview_window(PRESENCE_LABEL) {
        // Re-corner on every show: the monitor layout may have changed.
        let h = LAST_H.lock().map(|h| *h).unwrap_or(H);
        if let Some((x, y)) = corner_position(app, h) {
            let _ = win.set_position(LogicalPosition::new(x, y));
        }
        let _ = win.show();
        let _ = win.set_always_on_top(true);
        // Never set_focus — Arena keeps input.
    }
}

pub fn hide(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(PRESENCE_LABEL) {
        let _ = win.hide();
    }
}

fn set_enabled(app: &AppHandle, enabled: bool) {
    ENABLED.store(enabled, Ordering::SeqCst);
    if let Some(path) = enabled_path(app) {
        if let Some(dir) = path.parent() {
            let _ = fs::create_dir_all(dir);
        }
        let _ = fs::write(path, if enabled { b"1" as &[u8] } else { b"0" });
    }
    if enabled {
        show(app);
    } else {
        hide(app);
    }
}

/// Mirror of the Settings → In-game overlay → "Corner badge" toggle.
#[tauri::command]
pub fn presence_set_enabled(app: AppHandle, enabled: bool) {
    set_enabled(&app, enabled);
}

#[tauri::command]
pub fn presence_is_enabled() -> bool {
    is_enabled()
}

/// Match the window to what the webview actually paints — the badge alone, or
/// the badge plus an open cog menu. Anchored bottom-left, so the window has to
/// move as well as resize: it grows upward, never off the bottom of the screen.
#[tauri::command]
pub fn presence_set_size(app: AppHandle, width: f64, height: f64) {
    let w = width.clamp(MIN_W, MAX_W);
    let h = height.clamp(MIN_H, MAX_H);
    if let Ok(mut last) = LAST_H.lock() {
        *last = h;
    }
    let Some(win) = app.get_webview_window(PRESENCE_LABEL) else {
        return;
    };
    let _ = win.set_size(LogicalSize::new(w, h));
    if let Some((x, y)) = corner_position(&app, h) {
        let _ = win.set_position(LogicalPosition::new(x, y));
    }
}

/// Badge click — surface the main window (same as the tray "Open" item).
#[tauri::command]
pub fn presence_open_main(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}
