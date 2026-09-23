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
//! collapse state and an enabled toggle tied to matches.
//!
//! Default is top-right. Because the alert is click-through it cannot be
//! grabbed where it stands, so placing it is a mode: `toast_move_mode` pins a
//! sample alert that *does* take the mouse, the user drags it by its grip, and
//! Done puts it back to click-through. Asked for by a creator recording 1080p
//! on a 1920x1200 panel — the top 60px fall outside the frame and cut the
//! top-right alert in half.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

const TOAST_LABEL: &str = "toast";
const ENABLED_FILE: &str = "toast-window-enabled";
const GEOMETRY_FILE: &str = "toast-geometry.json";
const TOAST_EVENT: &str = "fnd:toast";
/// Broadcast on every move-mode change, so Settings' button follows a Done
/// pressed on the alert itself.
const MOVING_EVENT: &str = "toast:moving";

const W: f64 = 344.0;
const H: f64 = 104.0;
/// Gap from the working-area corner, matching the OS banner inset.
const MARGIN: f64 = 16.0;
/// How long a toast stays up. Long enough to read between Arena turns.
const LINGER_MS: u64 = 7_000;

static ENABLED: AtomicBool = AtomicBool::new(true);
/// True while the sample alert is pinned for dragging — see `toast_move_mode`.
static MOVING: AtomicBool = AtomicBool::new(false);

fn set_moving(app: &AppHandle, on: bool) {
    if MOVING.swap(on, Ordering::SeqCst) != on {
        let _ = app.emit(MOVING_EVENT, on);
    }
}
/// Bumped per toast so a stale hide timer never closes a newer toast.
static GENERATION: AtomicU64 = AtomicU64::new(0);
/// The toast in flight. The very first alert builds the webview, so the event
/// is emitted before that webview can subscribe — it pulls this on mount.
static PENDING: Mutex<Option<(ToastPayload, Instant)>> = Mutex::new(None);

/// Where the promoted alert sits, in logical px. `None` when it is not a
/// layer surface — the frontend uses that to pick native vs margin drag.
#[cfg(target_os = "linux")]
static LAYER_GEOMETRY: Mutex<Option<crate::presence::LayerGeometry>> = Mutex::new(None);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToastPayload {
    title: String,
    body: String,
    linger_ms: u64,
    /// The pinned, draggable sample from `toast_move_mode`.
    moving: bool,
}

/// Saved top-left of the alert, in logical px.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToastGeometry {
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

fn load_geometry(app: &AppHandle) -> Option<ToastGeometry> {
    let text = fs::read_to_string(geometry_path(app)?).ok()?;
    serde_json::from_str(&text).ok()
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
        // Drop the renderer — see drop_secondary_webview.
        destroy(app);
    }
}

/// The primary monitor, else the first one listed. Wayland has no notion of
/// a primary (GDK answers `None`), which put a first-run alert top-left.
fn main_monitor(app: &AppHandle) -> Option<tauri::Monitor> {
    app.primary_monitor()
        .ok()
        .flatten()
        .or_else(|| app.available_monitors().ok()?.into_iter().next())
}

/// Top-right of the main monitor, in logical px. Falls back to the OS
/// default position when no monitor is reported (headless / RDP races).
fn corner_position(app: &AppHandle) -> Option<(f64, f64)> {
    let m = main_monitor(app)?;
    let f = m.scale_factor().max(0.5);
    let mx = m.position().x as f64 / f;
    let my = m.position().y as f64 / f;
    let mw = m.size().width as f64 / f;
    Some((mx + mw - W - MARGIN, my + MARGIN))
}

/// Where the alert goes: the user's spot while it still sits on a monitor,
/// else the top-right corner. Re-read on every show, so an unplugged display
/// or a resolution change falls back to the corner instead of off screen.
fn resolve_position(app: &AppHandle) -> Option<(f64, f64)> {
    if let Some(g) = load_geometry(app) {
        let rects = crate::presence::monitor_rects(app);
        if rects.is_empty() || crate::presence::geometry_reachable(g.x, g.y, W, H, &rects) {
            return Some((g.x, g.y));
        }
    }
    corner_position(app)
}

/// Put the alert at `resolve_position`. Top-left anchors on a layer surface,
/// because a layer surface is moved by rewriting margins and the drag only
/// ever rewrites Left/Top — a top-right anchor would ignore it.
fn place(app: &AppHandle, win: &tauri::WebviewWindow) {
    let at = resolve_position(app);
    #[cfg(target_os = "linux")]
    if crate::layer_shell::is_promoted(win) {
        match at {
            Some((x, y)) => {
                let place = crate::layer_shell::Placement::top_left(x as i32, y as i32, (W, H));
                if crate::layer_shell::reapply(win, place) {
                    seed_layer_geometry(true, x, y);
                }
            }
            // No monitor reported: at least un-park it from `conceal`.
            None => {
                let _ = crate::layer_shell::reveal(win);
            }
        }
        return;
    }
    if let Some((x, y)) = at {
        let _ = win.set_position(tauri::LogicalPosition::new(x, y));
    }
}

#[cfg(target_os = "linux")]
fn seed_layer_geometry(promoted: bool, x: f64, y: f64) {
    *LAYER_GEOMETRY.lock().unwrap() = promoted.then_some(crate::presence::LayerGeometry {
        left: x.max(0.0),
        top: y.max(0.0),
        width: W,
        height: H,
    });
}

fn ensure_window(app: &AppHandle) -> Result<(), String> {
    if app.get_webview_window(TOAST_LABEL).is_some() {
        return Ok(());
    }
    if crate::refuse_if_main_thread("toast::ensure_window") {
        return Err("refused: webview build on the main thread".into());
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

    let at = resolve_position(app);
    let builder = match at {
        Some((x, y)) => builder.position(x, y),
        None => builder,
    };

    let win = builder.build().map_err(|e| e.to_string())?;

    // Same reason as the HUD and the badge: under Wayland this window cannot
    // raise itself above Arena, and a fullscreen game swallows the frame. The
    // overlay layer outranks every window. Anchors and margins replace the
    // `position()` above, which the compositor ignores once promoted.
    //
    // Click-through still works here — an empty input region is a property of
    // the surface, not of the toplevel, so it applies to a layer surface too.
    #[cfg(target_os = "linux")]
    {
        let (x, y) = at.unwrap_or((MARGIN, MARGIN));
        let promoted = crate::layer_shell::promote(
            &win,
            crate::layer_shell::Placement::top_left(x as i32, y as i32, (W, H)),
        );
        seed_layer_geometry(promoted, x, y);
    }

    // Never eat a click meant for Arena. Linux cannot do this on a hidden
    // window (tao unwraps a null GdkWindow and aborts) — applied after
    // `show()` in `show_toast`.
    #[cfg(not(target_os = "linux"))]
    let _ = win.set_ignore_cursor_events(true);
    #[cfg(target_os = "linux")]
    let _ = win;
    Ok(())
}

/// Follow Arena off screen — see `crate::hypr`. One-way on purpose: the alert
/// owns its own linger timer, and re-showing a match result the user never saw
/// minutes later would be worse than dropping it.
#[cfg(target_os = "linux")]
pub fn apply_surface_visibility(app: &AppHandle) {
    // The user is placing it — leave it where they can see it.
    if crate::hypr::surfaces_visible() || MOVING.load(Ordering::SeqCst) {
        return;
    }
    if let Some(win) = app.get_webview_window(TOAST_LABEL) {
        if !crate::layer_shell::conceal(&win) {
            let _ = win.hide();
        }
    }
}

/// Drop the toast webview, freeing its renderer process — see
/// [`crate::drop_secondary_webview`].
pub fn destroy(app: &AppHandle) {
    set_moving(app, false);
    #[cfg(target_os = "linux")]
    seed_layer_geometry(false, 0.0, 0.0);
    if let Some(win) = app.get_webview_window(TOAST_LABEL) {
        crate::drop_secondary_webview(&win);
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
    // A real alert ends move mode: it must go back to click-through, since
    // it can land mid-match.
    set_moving(app, false);
    let gen = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let payload = ToastPayload {
        title: title.to_string(),
        body: body.to_string(),
        linger_ms: LINGER_MS,
        moving: false,
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
    // Arena is off screen — see `crate::hypr`. The alert is a transient nudge
    // about the game, so on another workspace it is pure interruption. Dropped
    // rather than queued: by the time the user comes back it is stale.
    #[cfg(target_os = "linux")]
    if !crate::hypr::surfaces_visible() {
        return;
    }
    if let Err(e) = ensure_window(app) {
        eprintln!("[toast] ensure_window: {e}");
        return;
    }

    present(app, payload);

    let app_hide = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(LINGER_MS + 350));
        // A newer toast reused the window — let its own timer close it.
        if GENERATION.load(Ordering::SeqCst) != gen {
            return;
        }
        let target = app_hide.clone();
        // Destroy to free the renderer process; the toast is rebuilt on
        // demand and only appears at match end.
        let _ = app_hide.run_on_main_thread(move || destroy(&target));
    });
}

/// Place, show and paint the alert. `payload.moving` decides whether it takes
/// the mouse. The window must already exist (`ensure_window`).
fn present(app: &AppHandle, payload: ToastPayload) {
    let app_show = app.clone();
    let _ = app.run_on_main_thread(move || {
        // Re-place every time: the monitor layout may have changed since the
        // window was built (laptop undocked, resolution switch).
        if let Some(win) = app_show.get_webview_window(TOAST_LABEL) {
            place(&app_show, &win);
            let _ = win.show();
            // Re-assert: another top-most window may have taken the layer.
            let _ = win.set_always_on_top(true);
            // Linux: deferred from `ensure_window`, where the widget had no
            // GdkWindow to shape yet. Safe here — window requests dispatch in
            // order, so this lands after the `show()` above has realized it.
            // Never eat a click meant for Arena, except while being placed.
            crate::set_ignore_cursor_events_after_show(&win, !payload.moving);
            // Do not set_focus — Arena must keep input.
        }
        let _ = app_show.emit_to(TOAST_LABEL, TOAST_EVENT, payload);
    });
}

/// Pin a sample alert that takes the mouse so the user can drag it, or put
/// it away again. Settings and the badge's ⚙ menu both drive this.
#[tauri::command]
pub fn toast_move_mode(app: AppHandle, on: bool) {
    // Off the main thread — the webview may need building. See `toast_show`.
    std::thread::spawn(move || {
        // Invalidate any real alert's hide timer: it must not close the
        // pinned sample out from under the drag.
        GENERATION.fetch_add(1, Ordering::SeqCst);
        if !on {
            let target = app.clone();
            let _ = app.run_on_main_thread(move || destroy(&target));
            return;
        }
        set_moving(&app, true);
        let payload = ToastPayload {
            title: "Filthy Net Deck".into(),
            body: "Drag the grip to place match alerts".into(),
            // No linger: it stays until Done. `toast_pending` special-cases it.
            linger_ms: 0,
            moving: true,
        };
        if let Ok(mut slot) = PENDING.lock() {
            *slot = Some((payload.clone(), Instant::now()));
        }
        if let Err(e) = ensure_window(&app) {
            eprintln!("[toast] ensure_window: {e}");
            set_moving(&app, false);
            return;
        }
        present(&app, payload);
    });
}

/// Where the promoted alert sits — `null` when it is an ordinary window, so
/// the frontend keeps the native drag. Same contract as the badge.
#[tauri::command]
pub fn toast_layer_geometry() -> Option<crate::presence::LayerGeometryDto> {
    #[cfg(target_os = "linux")]
    {
        *LAYER_GEOMETRY.lock().unwrap()
    }
    #[cfg(not(target_os = "linux"))]
    {
        None
    }
}

/// Move the promoted alert. False when it is not a layer surface.
#[tauri::command]
pub fn toast_set_margins(app: AppHandle, left: f64, top: f64) -> bool {
    #[cfg(target_os = "linux")]
    {
        let Some(win) = app.get_webview_window(TOAST_LABEL) else {
            return false;
        };
        if !crate::layer_shell::set_margins(&win, left, top) {
            return false;
        }
        if let Some(g) = LAYER_GEOMETRY.lock().unwrap().as_mut() {
            g.left = left.max(0.0);
            g.top = top.max(0.0);
        }
        true
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (&app, left, top);
        false
    }
}

/// Persist the alert's top-left after a drag (layer or native).
#[tauri::command]
pub fn toast_save_geometry(app: AppHandle, geometry: ToastGeometry) {
    let Some(path) = geometry_path(&app) else {
        return;
    };
    if let Some(dir) = path.parent() {
        let _ = fs::create_dir_all(dir);
    }
    if let Ok(json) = serde_json::to_string_pretty(&geometry) {
        let _ = fs::write(path, json);
    }
}

/// Forget the saved spot and put the alert back in the top-right corner.
/// Answers with that corner so the margin drag can resync its copy.
#[tauri::command]
pub fn toast_reset_position(app: AppHandle) -> Option<ToastGeometry> {
    if let Some(path) = geometry_path(&app) {
        let _ = fs::remove_file(path);
    }
    let target = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(win) = target.get_webview_window(TOAST_LABEL) {
            place(&target, &win);
        }
    });
    corner_position(&app).map(|(x, y)| ToastGeometry { x, y })
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
    // Off the main thread: a synchronous `#[tauri::command]` runs on it, and
    // `show_toast` has to build the toast webview when one is not already up
    // (it is no longer prewarmed at boot). Building on the event loop
    // deadlocks it on Windows — see the comment in `show_toast`.
    std::thread::spawn(move || show_toast(&app, &title, &body));
}

/// The alert still inside its linger window, with the remaining time. The
/// toast webview calls this once on mount so the *first* alert — the one that
/// built the webview, and so missed the event — still paints.
#[tauri::command]
pub fn toast_pending() -> Option<ToastPayload> {
    let slot = PENDING.lock().ok()?;
    let (payload, at) = slot.as_ref()?;
    if payload.moving {
        return MOVING.load(Ordering::SeqCst).then(|| payload.clone());
    }
    let elapsed = at.elapsed().as_millis() as u64;
    let left = payload.linger_ms.checked_sub(elapsed)?;
    Some(ToastPayload {
        linger_ms: left,
        ..payload.clone()
    })
}
