//! Corner presence badge — "Filthy Net Deck is running", visible the whole
//! time Arena is open, not just during a match.
//!
//! Default is bottom-left of the primary monitor (16px inset). The user can
//! drag it anywhere — same contract as the match HUD — and the position is
//! remembered across launches. Distinct from the HUD on purpose: that one is
//! match-scoped; this one stays up the whole time Arena is open.
//!
//! Not click-through: the cog has to be clickable. The badge window is sized
//! to exactly what the pill paints (`presence_set_size`). The cog menu is a
//! *second* window (`presence-menu`): growing this one around the menu is a
//! silent no-op to reposition on Wayland, and Hyprland then resizes floating
//! windows about their centre, which shoved the combined surface off-screen.

use serde::{Deserialize, Serialize};
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
const GEOMETRY_FILE: &str = "presence-geometry.json";
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
/// First-run inset from the working-area corner.
const MARGIN: f64 = 16.0;
/// Gap between the badge and the menu. Matches the old CSS flex gap.
const GAP: f64 = 8.0;

static ENABLED: AtomicBool = AtomicBool::new(true);
/// Last size the webview asked for — `show()` places against it, and the
/// menu window sits this many px away from the badge.
static LAST_W: Mutex<f64> = Mutex::new(W);
static LAST_H: Mutex<f64> = Mutex::new(H);
/// Last top-left we asked the compositor for, in logical px. `None` until
/// the first place, so a size report before any drag can still re-default
/// to the bottom-left corner as the pill measures itself.
static LAST_X: Mutex<Option<f64>> = Mutex::new(None);
static LAST_Y: Mutex<Option<f64>> = Mutex::new(None);
/// True once the user has dragged (or a previous drag was loaded from disk).
/// Distinct from LAST_X being set: first show writes LAST_X to the default
/// corner, and a later `presence_set_size` must still be allowed to re-default
/// against the measured height.
static USER_PLACED: AtomicBool = AtomicBool::new(false);

/// Geometry currently applied to the promoted badge. `None` when it is not
/// a layer surface — the frontend uses that to pick native vs margin drag.
/// Tracked here because a layer surface lies about both its position and
/// its size; see `overlay::LAYER_GEOMETRY`.
#[cfg(target_os = "linux")]
static LAYER_GEOMETRY: Mutex<Option<LayerGeometry>> = Mutex::new(None);

#[cfg(target_os = "linux")]
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerGeometry {
    pub left: f64,
    pub top: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresenceGeometry {
    pub x: f64,
    pub y: f64,
}

fn enabled_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join(ENABLED_FILE))
}

fn geometry_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|d| d.join(GEOMETRY_FILE))
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

fn badge_w() -> f64 {
    LAST_W.lock().map(|w| *w).unwrap_or(W)
}

fn badge_h() -> f64 {
    LAST_H.lock().map(|h| *h).unwrap_or(H)
}

fn remember_xy(x: f64, y: f64) {
    if let Ok(mut v) = LAST_X.lock() {
        *v = Some(x);
    }
    if let Ok(mut v) = LAST_Y.lock() {
        *v = Some(y);
    }
}

fn load_geometry(app: &AppHandle) -> Option<PresenceGeometry> {
    let path = geometry_path(app)?;
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

fn save_geometry(app: &AppHandle, g: &PresenceGeometry) {
    USER_PLACED.store(true, Ordering::SeqCst);
    remember_xy(g.x, g.y);
    if let Some(path) = geometry_path(app) {
        if let Some(dir) = path.parent() {
            let _ = fs::create_dir_all(dir);
        }
        if let Ok(json) = serde_json::to_string_pretty(g) {
            let _ = fs::write(path, json);
        }
    }
}

/// Logical monitor rect: (x, y, width, height).
type MonitorRect = (f64, f64, f64, f64);

/// True when enough of the pill overlaps a monitor to grab it. Saved
/// geometry from an unplugged display / changed layout fails this and
/// falls back to the bottom-left default (the size is kept).
fn geometry_reachable(x: f64, y: f64, w: f64, h: f64, monitors: &[MonitorRect]) -> bool {
    const GRAB_W: f64 = 24.0;
    monitors.iter().any(|&(mx, my, mw, mh)| {
        let overlap_w = (x + w).min(mx + mw) - x.max(mx);
        let overlap_h = (y + h).min(my + mh) - y.max(my);
        overlap_w >= GRAB_W && overlap_h >= h / 2.0
    })
}

fn monitor_rects(app: &AppHandle) -> Vec<MonitorRect> {
    app.available_monitors()
        .map(|monitors| {
            monitors
                .iter()
                .map(|m| {
                    let f = m.scale_factor().max(0.5);
                    (
                        m.position().x as f64 / f,
                        m.position().y as f64 / f,
                        m.size().width as f64 / f,
                        m.size().height as f64 / f,
                    )
                })
                .collect()
        })
        .unwrap_or_default()
}

/// First-run (and stranded-save) position: bottom-left of the primary
/// monitor, 16px in. The user then drags it wherever they like.
fn default_origin(mx: f64, my: f64, mh: f64, h: f64) -> (f64, f64) {
    (mx + MARGIN, my + mh - h - MARGIN)
}

fn default_xy(app: &AppHandle, h: f64) -> (f64, f64) {
    let Some(m) = app.primary_monitor().ok().flatten() else {
        return (MARGIN, MARGIN);
    };
    let f = m.scale_factor().max(0.5);
    let mx = m.position().x as f64 / f;
    let my = m.position().y as f64 / f;
    let mh = m.size().height as f64 / f;
    default_origin(mx, my, mh, h)
}

/// Saved / last-dragged position if it still sits on a monitor, else the
/// bottom-left default.
fn resolve_position(app: &AppHandle, w: f64, h: f64) -> (f64, f64) {
    let rects = monitor_rects(app);
    if let Some(g) = load_geometry(app) {
        if rects.is_empty() || geometry_reachable(g.x, g.y, w, h, &rects) {
            USER_PLACED.store(true, Ordering::SeqCst);
            return (g.x, g.y);
        }
    }
    if USER_PLACED.load(Ordering::SeqCst) {
        if let (Ok(x), Ok(y)) = (LAST_X.lock(), LAST_Y.lock()) {
            if let (Some(lx), Some(ly)) = (*x, *y) {
                if rects.is_empty() || geometry_reachable(lx, ly, w, h, &rects) {
                    return (lx, ly);
                }
            }
        }
    }
    default_xy(app, h)
}

#[cfg(target_os = "linux")]
fn badge_place(x: f64, y: f64, w: f64, h: f64) -> crate::layer_shell::Placement {
    crate::layer_shell::Placement::top_left(x as i32, y as i32, (w, h))
}

#[cfg(target_os = "linux")]
fn seed_layer_geometry(promoted: bool, x: f64, y: f64, w: f64, h: f64) {
    *LAYER_GEOMETRY.lock().unwrap() = promoted.then_some(LayerGeometry {
        left: x.max(0.0),
        top: y.max(0.0),
        width: w,
        height: h,
    });
}

/// Menu sits `GAP` px above the badge when there is room, otherwise below
/// it, and is clamped onto the monitor so a badge at the right edge does
/// not open the panel off-screen.
fn menu_origin(
    (badge_x, badge_y, badge_h): (f64, f64, f64),
    (menu_w, menu_h): (f64, f64),
    (mx, my, mw): (f64, f64, f64),
) -> (f64, f64) {
    let mut x = badge_x;
    let mut y = badge_y - GAP - menu_h;
    if y < my + MARGIN {
        y = badge_y + badge_h + GAP;
    }
    let max_x = (mx + mw - menu_w - MARGIN).max(mx + MARGIN);
    if x > max_x {
        x = max_x;
    }
    if x < mx + MARGIN {
        x = mx + MARGIN;
    }
    (x, y)
}

fn menu_xy(app: &AppHandle, menu_w: f64, menu_h: f64) -> Option<(f64, f64)> {
    let m = app.primary_monitor().ok().flatten()?;
    let f = m.scale_factor().max(0.5);
    let mx = m.position().x as f64 / f;
    let my = m.position().y as f64 / f;
    let mw = m.size().width as f64 / f;
    let w = badge_w();
    let h = badge_h();
    let (bx, by) = resolve_position(app, w, h);
    Some(menu_origin((bx, by, h), (menu_w, menu_h), (mx, my, mw)))
}

fn ensure_window(app: &AppHandle) -> Result<(), String> {
    if app.get_webview_window(PRESENCE_LABEL).is_some() {
        return Ok(());
    }
    if crate::refuse_if_main_thread("presence::ensure_window") {
        return Err("refused: webview build on the main thread".into());
    }
    let (x, y) = resolve_position(app, W, H);
    remember_xy(x, y);
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

    let builder = builder.position(x, y);

    let win = builder.build().map_err(|e| e.to_string())?;

    // Must happen here: the window is built `.visible(false)`, so it is still
    // unrealized and layer-shell can claim it. After `show()` it is too late.
    // The absolute `position()` above is simply ignored once promoted — the
    // compositor places the surface from the anchors instead.
    // Keyboard interactivity stays OFF. On-demand made Hyprland consume each
    // click to hand this surface focus, which Arena then immediately took back
    // -- so every click went into the focus fight and none reached the webview.
    // The Omarchy bar is clickable and asks for no keyboard either; buttons go
    // to the surface under the cursor without any focus change.
    //
    // Top-left anchors, matching the HUD: a layer surface has no move request,
    // so dragging rewrites these margins (see `src/overlay/layerDrag.ts`).
    #[cfg(target_os = "linux")]
    {
        let promoted = crate::layer_shell::promote(&win, badge_place(x, y, W, H));
        seed_layer_geometry(promoted, x, y, W, H);
    }
    let _ = &win;

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

    let builder = match menu_xy(app, width, height) {
        Some((x, y)) => builder.position(x, y),
        None => builder,
    };

    let win = builder.build().map_err(|e| e.to_string())?;

    #[cfg(target_os = "linux")]
    {
        // No keyboard here either -- same reason as the badge. The menu is
        // buttons, not text entry, so it never needs key input.
        if let Some((x, y)) = menu_xy(app, width, height) {
            crate::layer_shell::promote(
                &win,
                crate::layer_shell::Placement::top_left(x as i32, y as i32, (width, height)),
            );
        }
    }
    let _ = &win;

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
    // The window is destroyed when Arena quits, so it is usually absent
    // here. Re-show + re-size an existing one; only build if missing.
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
            if let Some((x, y)) = menu_xy(&app_show, w, h) {
                let _ = win.set_position(LogicalPosition::new(x, y));
                #[cfg(target_os = "linux")]
                {
                    let place = crate::layer_shell::Placement::top_left(x as i32, y as i32, (w, h));
                    let _ = crate::layer_shell::reapply(&win, place);
                }
            }
            #[cfg(target_os = "linux")]
            let _ = crate::layer_shell::reveal(&win);
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
    // Arena is running but parked on a workspace that is not on screen. A layer
    // surface has no workspace of its own, so showing it now would put the
    // badge over whatever the user is actually looking at — see `crate::hypr`.
    #[cfg(target_os = "linux")]
    if !crate::hypr::surfaces_visible() {
        return;
    }
    if let Err(e) = ensure_window(app) {
        eprintln!("[presence] ensure_window: {e}");
        return;
    }
    if let Some(win) = app.get_webview_window(PRESENCE_LABEL) {
        let w = badge_w();
        let h = badge_h();
        let (x, y) = resolve_position(app, w, h);
        remember_xy(x, y);
        let _ = win.set_position(LogicalPosition::new(x, y));
        #[cfg(target_os = "linux")]
        {
            if crate::layer_shell::reapply(&win, badge_place(x, y, w, h)) {
                seed_layer_geometry(true, x, y, w, h);
            }
            let _ = crate::layer_shell::reveal(&win);
        }
        let _ = win.show();
        let _ = win.set_always_on_top(true);
        // Never set_focus — Arena keeps input.
    }
}

/// Drop the presence webviews, freeing a renderer process each — see
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
    if let Ok(mut last) = LAST_W.lock() {
        *last = w;
    }
    if let Ok(mut last) = LAST_H.lock() {
        *last = h;
    }
    let Some(win) = app.get_webview_window(PRESENCE_LABEL) else {
        return;
    };
    // Unplaced: re-default against the measured height so the first-run
    // corner stays bottom-left as the pill shrinks from the 40px placeholder
    // to ~32px. User-placed: keep the top-left they chose.
    let (x, y) = resolve_position(&app, w, h);
    remember_xy(x, y);
    #[cfg(target_os = "linux")]
    if crate::layer_shell::reapply(&win, badge_place(x, y, w, h)) {
        seed_layer_geometry(true, x, y, w, h);
        return;
    }
    let _ = win.set_size(LogicalSize::new(w, h));
    let _ = win.set_position(LogicalPosition::new(x, y));
}

/// Where the promoted badge sits and how big it is, in logical px — or
/// `null` when it is an ordinary window. The frontend uses the null-ness
/// to choose native `data-tauri-drag-region` vs the margin drag.
#[tauri::command]
pub fn presence_layer_geometry() -> Option<LayerGeometryDto> {
    #[cfg(target_os = "linux")]
    {
        *LAYER_GEOMETRY.lock().unwrap()
    }
    #[cfg(not(target_os = "linux"))]
    {
        None
    }
}

/// `LayerGeometry` only exists on Linux; everywhere else the command still
/// has to name a type, and it always answers `None`.
#[cfg(target_os = "linux")]
pub type LayerGeometryDto = LayerGeometry;
#[cfg(not(target_os = "linux"))]
pub type LayerGeometryDto = ();

/// Move the promoted badge. Returns false when this window is not a layer
/// surface, so the caller can fall back to `set_position`.
#[tauri::command]
pub fn presence_set_margins(app: AppHandle, left: f64, top: f64) -> bool {
    #[cfg(target_os = "linux")]
    {
        let Some(win) = app.get_webview_window(PRESENCE_LABEL) else {
            return false;
        };
        if !crate::layer_shell::set_margins(&win, left, top) {
            return false;
        }
        let left = left.max(0.0);
        let top = top.max(0.0);
        USER_PLACED.store(true, Ordering::SeqCst);
        remember_xy(left, top);
        if let Some(g) = LAYER_GEOMETRY.lock().unwrap().as_mut() {
            g.left = left;
            g.top = top;
        }
        true
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (&app, left, top);
        false
    }
}

/// Persist the badge's top-left after a drag (layer or native).
#[tauri::command]
pub fn presence_save_geometry(app: AppHandle, geometry: PresenceGeometry) {
    save_geometry(&app, &geometry);
}

#[tauri::command]
pub fn presence_get_geometry(app: AppHandle) -> Option<PresenceGeometry> {
    load_geometry(&app)
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

/// Follow Arena on and off screen. The badge has no workspace of its own once
/// it is a layer surface, so this is what keeps it with the game — see
/// `crate::hypr`. `show` re-checks every other precondition, so coming back is
/// just a call to it rather than a second copy of that logic.
#[cfg(target_os = "linux")]
pub fn apply_surface_visibility(app: &AppHandle) {
    if crate::hypr::surfaces_visible() {
        show(app);
        return;
    }
    if let Some(win) = app.get_webview_window(PRESENCE_LABEL) {
        if !crate::layer_shell::conceal(&win) {
            let _ = win.hide();
        }
    }
    // Park the cog menu too. Destroying it unmaps a layer surface, which is
    // the same blackout trigger as hiding the badge. Click-away still
    // `destroy_menu`s; coming back to Arena does not reopen it.
    if let Some(win) = app.get_webview_window(MENU_LABEL) {
        if crate::layer_shell::conceal(&win) {
            let _ = app.emit(MENU_EVENT, false);
        } else {
            destroy_menu(app);
        }
    }
}

/// Take the badge and its cog menu back to the top of the overlay layer — see
/// `crate::hypr::reassert`. Badge first, menu second, so the menu ends up above
/// the badge exactly as it does when it is opened normally.
#[cfg(target_os = "linux")]
pub fn remap_promoted(app: &AppHandle) {
    for label in [PRESENCE_LABEL, MENU_LABEL] {
        let Some(win) = app.get_webview_window(label) else {
            continue;
        };
        if crate::layer_shell::remap(&win) {
            // Mirrors `show`: inert on a layer surface, but kept so the two
            // paths cannot drift if this window is ever an ordinary toplevel.
            let _ = win.set_always_on_top(true);
        }
    }
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
    fn default_is_bottom_left() {
        let (x, y) = default_origin(0.0, 0.0, 960.0, 32.0);
        assert_eq!(x, MARGIN);
        assert_eq!(y, 960.0 - 32.0 - MARGIN);
    }

    #[test]
    fn default_does_not_special_case_16_10() {
        // 1536×960 is this laptop; the 16:9 letterbox is the user's to drag
        // into, not a margin we hardcode for one panel.
        let (_, y_16_10) = default_origin(0.0, 0.0, 960.0, 32.0);
        let (_, y_16_9) = default_origin(0.0, 0.0, 864.0, 32.0);
        assert_eq!(y_16_10, 912.0);
        assert_eq!(y_16_9, 816.0);
    }

    #[test]
    fn menu_sits_gap_above_badge() {
        let badge_h = 40.0;
        let menu_h = 330.0;
        let mh = 750.0;
        let badge_y = mh - MARGIN - badge_h;
        let (x, y) = menu_origin(
            (MARGIN, badge_y, badge_h),
            (246.0, menu_h),
            (0.0, 0.0, 1280.0),
        );
        assert_eq!(x, MARGIN);
        assert_eq!(y, badge_y - GAP - menu_h);
        let menu_bottom = y + menu_h;
        assert_eq!(badge_y - menu_bottom, GAP);
    }

    #[test]
    fn menu_flips_below_when_no_room_above() {
        let (x, y) = menu_origin((16.0, 20.0, 32.0), (246.0, 330.0), (0.0, 0.0, 1280.0));
        assert_eq!(x, 16.0);
        assert_eq!(y, 20.0 + 32.0 + GAP);
    }

    #[test]
    fn menu_clamps_off_the_right_edge() {
        let (x, _) = menu_origin((1200.0, 400.0, 32.0), (246.0, 200.0), (0.0, 0.0, 1280.0));
        assert_eq!(x, 1280.0 - 246.0 - MARGIN);
    }

    #[test]
    fn menu_follows_a_dragged_badge() {
        let (x, y) = menu_origin((80.0, 400.0, 32.0), (246.0, 200.0), (0.0, 0.0, 1280.0));
        assert_eq!(x, 80.0);
        assert_eq!(y, 400.0 - GAP - 200.0);
    }

    #[test]
    fn geometry_reachable_detects_stranded_positions() {
        let one = [(0.0, 0.0, 1920.0, 1080.0)];
        assert!(geometry_reachable(16.0, 1000.0, 142.0, 32.0, &one));
        assert!(!geometry_reachable(-2400.0, 50.0, 142.0, 32.0, &one));
        assert!(geometry_reachable(1880.0, 0.0, 142.0, 32.0, &one));
        assert!(!geometry_reachable(100.0, -40.0, 142.0, 32.0, &one));
        let two = [(0.0, 0.0, 1920.0, 1080.0), (-2560.0, 0.0, 2560.0, 1440.0)];
        assert!(geometry_reachable(-2400.0, 50.0, 142.0, 32.0, &two));
    }
}
