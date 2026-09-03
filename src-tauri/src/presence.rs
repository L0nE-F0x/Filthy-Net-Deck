//! Corner presence badge — "Filthy Net Deck is running", visible the whole
//! time Arena is open, not just during a match.
//!
//! Sits bottom-left of the primary monitor: the FND mark, a live dot, and a
//! cog for the overlay settings worth changing between matches. Distinct from
//! the `overlay` HUD on purpose — that one is match-scoped and the user drags
//! it wherever they like; this is a fixed, predictable anchor.
//!
//! Not click-through: the cog has to be clickable. The badge window is sized
//! to exactly what the pill paints (`presence_set_size`). The cog menu is a
//! *second* window (`presence-menu`): growing this one around the menu is a
//! silent no-op to reposition on Wayland, and Hyprland then resizes floating
//! windows about their centre, which shoved the combined surface off-screen.

use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder,
};

const PRESENCE_LABEL: &str = "presence";
const MENU_LABEL: &str = "presence-menu";
const ENABLED_FILE: &str = "presence-enabled";
const MENU_EVENT: &str = "presence:menu";

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
const MAX_H: f64 = 80.0;
const MENU_MIN_W: f64 = 180.0;
const MENU_MAX_W: f64 = 420.0;
const MENU_MIN_H: f64 = 80.0;
const MENU_MAX_H: f64 = 620.0;
/// Gap from the working-area corner.
const MARGIN: f64 = 16.0;
/// Gap between the badge top and the menu bottom. Matches the old CSS flex gap.
const GAP: f64 = 8.0;

static ENABLED: AtomicBool = AtomicBool::new(true);
/// Last height the webview asked for — `show()` re-corners against it, and
/// the menu window sits this many px above the badge.
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

fn badge_h() -> f64 {
    LAST_H.lock().map(|h| *h).unwrap_or(H)
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

/// Menu sits on the same left margin, `GAP` px above the badge.
fn menu_position(app: &AppHandle, menu_h: f64, badge_h: f64) -> Option<(f64, f64)> {
    let m = app.primary_monitor().ok().flatten()?;
    let f = m.scale_factor().max(0.5);
    let mx = m.position().x as f64 / f;
    let my = m.position().y as f64 / f;
    let mh = m.size().height as f64 / f;
    Some(menu_origin(mx, my, mh, badge_h, menu_h))
}

fn menu_origin(mx: f64, my: f64, mh: f64, badge_h: f64, menu_h: f64) -> (f64, f64) {
    let x = mx + MARGIN;
    let y = (my + mh - menu_h - badge_h - GAP - MARGIN).max(my + MARGIN);
    (x, y)
}

fn ensure_window(app: &AppHandle) -> Result<(), String> {
    if app.get_webview_window(PRESENCE_LABEL).is_some() {
        return Ok(());
    }
    if crate::refuse_if_main_thread("presence::ensure_window") {
        return Err("refused: webview build on the main thread".into());
    }
    let url = WebviewUrl::App("index.html#/presence".into());
    let builder = WebviewWindowBuilder::new(app, PRESENCE_LABEL, url)
        .title("Filthy Net Deck — Running")
        .inner_size(W, H)
        .min_inner_size(MIN_W, MIN_H)
        .max_inner_size(MAX_W, MAX_H)
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

fn ensure_menu_window(app: &AppHandle, width: f64, height: f64) -> Result<(), String> {
    if app.get_webview_window(MENU_LABEL).is_some() {
        return Ok(());
    }
    if crate::refuse_if_main_thread("presence::ensure_menu_window") {
        return Err("refused: webview build on the main thread".into());
    }
    let url = WebviewUrl::App("index.html#/presence-menu".into());
    let builder = WebviewWindowBuilder::new(app, MENU_LABEL, url)
        .title("Filthy Net Deck — Presence menu")
        .inner_size(width, height)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .focused(false);

    #[cfg(not(target_os = "macos"))]
    let builder = builder.transparent(true);

    let builder = match menu_position(app, height, badge_h()) {
        Some((x, y)) => builder.position(x, y),
        None => builder,
    };

    builder.build().map_err(|e| e.to_string())?;
    Ok(())
}

fn chrome_focused(app: &AppHandle) -> bool {
    let badge = app
        .get_webview_window(PRESENCE_LABEL)
        .and_then(|w| w.is_focused().ok())
        .unwrap_or(false);
    let menu = app
        .get_webview_window(MENU_LABEL)
        .and_then(|w| w.is_focused().ok())
        .unwrap_or(false);
    badge || menu
}

fn destroy_menu(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(MENU_LABEL) {
        crate::drop_secondary_webview(&win);
        let _ = app.emit(MENU_EVENT, false);
    }
}

fn open_menu(app: &AppHandle, width: f64, height: f64) {
    if !is_enabled() || !crate::arena::is_running() {
        return;
    }
    let w = width.clamp(MENU_MIN_W, MENU_MAX_W);
    let h = height.clamp(MENU_MIN_H, MENU_MAX_H);
    // Linux hides this window instead of destroying it (WebKit teardown
    // abort). Re-show + re-size the existing one; only build if missing.
    if app.get_webview_window(MENU_LABEL).is_none() {
        if let Err(e) = ensure_menu_window(app, w, h) {
            eprintln!("[presence] ensure_menu_window: {e}");
            let _ = app.emit(MENU_EVENT, false);
            return;
        }
    }
    let app_show = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(win) = app_show.get_webview_window(MENU_LABEL) {
            let _ = win.set_size(LogicalSize::new(w, h));
            if let Some((x, y)) = menu_position(&app_show, h, badge_h()) {
                let _ = win.set_position(LogicalPosition::new(x, y));
            }
            let _ = win.show();
            let _ = win.set_always_on_top(true);
        }
        let _ = app_show.emit(MENU_EVENT, true);
    });
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
        let h = badge_h();
        if let Some((x, y)) = corner_position(app, h) {
            let _ = win.set_position(LogicalPosition::new(x, y));
        }
        let _ = win.show();
        let _ = win.set_always_on_top(true);
        // Never set_focus — Arena keeps input.
    }
}

/// Drop the presence webviews. Windows destroys them (WebView2 RAM); Linux
/// hides them so WebKitGTK does not abort its GPU process on teardown — see
/// [`crate::drop_secondary_webview`]. Used when Arena quits or the badge is
/// turned off.
pub fn destroy(app: &AppHandle) {
    destroy_menu(app);
    if let Some(win) = app.get_webview_window(PRESENCE_LABEL) {
        crate::drop_secondary_webview(&win);
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
        // `show` creates the webview, and this runs from a *synchronous*
        // `#[tauri::command]` — which Tauri 2 executes on the main thread.
        // `WebviewWindowBuilder::build()` there deadlocks the Windows event
        // loop (see toast.rs). Hand the create to a worker thread; Tauri does
        // its own hop internally.
        let handle = app.clone();
        std::thread::spawn(move || show(&handle));
    } else {
        // Teardown on the calling thread is safe.
        destroy(app);
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

/// Match the badge window to the pill it paints. The cog menu is a separate
/// window — do not grow this one around it.
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
    crate::show_main_window(&app);
}

/// Open the cog menu as its own window, already sized to `width`×`height`.
/// The badge measures an off-screen clone first so this window never resizes
/// after map — required on Wayland, where a later `set_position` is ignored.
#[tauri::command]
pub fn presence_open_menu(app: AppHandle, width: f64, height: f64) {
    std::thread::spawn(move || open_menu(&app, width, height));
}

#[tauri::command]
pub fn presence_close_menu(app: AppHandle) {
    destroy_menu(&app);
}

/// Blur-dismiss. No-op when focus merely moved between the badge and the menu.
#[tauri::command]
pub fn presence_close_menu_if_unfocused(app: AppHandle) {
    if chrome_focused(&app) {
        return;
    }
    destroy_menu(&app);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn menu_sits_gap_above_badge() {
        let mh = 750.0;
        let badge_h = 40.0;
        let menu_h = 330.0;
        let (x, y) = menu_origin(0.0, 0.0, mh, badge_h, menu_h);
        assert_eq!(x, MARGIN);
        assert_eq!(y, mh - menu_h - badge_h - GAP - MARGIN);
        let menu_bottom = y + menu_h;
        let badge_top = mh - MARGIN - badge_h;
        assert_eq!(badge_top - menu_bottom, GAP);
    }

    #[test]
    fn menu_clamps_to_monitor_top() {
        let (x, y) = menu_origin(10.0, 20.0, 200.0, 40.0, 400.0);
        assert_eq!(x, 10.0 + MARGIN);
        assert_eq!(y, 20.0 + MARGIN);
    }
}
