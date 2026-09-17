//! Always-on-top match HUD window. Rust owns create/show/hide so the main
//! WebView can stay tray-hidden without missing match-start events.
//! Geometry (size/position) is persisted so the user can resize + edge-snap once.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder};

const OVERLAY_LABEL: &str = "overlay";
const ENABLED_FILE: &str = "overlay-enabled";
const POST_MATCH_FILE: &str = "overlay-post-match";
const MODE_FILE: &str = "overlay-window-mode";
const GEOMETRY_FILE: &str = "overlay-geometry.json";

/// Quiet collapsed HUD (name + archetype + confidence + session + land% +
/// turn + clock) needs ~360. Saved geometry is left alone — first-open only.
const DEFAULT_W: f64 = 360.0;
/// Minimal density (no card art) stays readable down to ~164 logical px.
const MIN_W: f64 = 164.0;
/// Collapsed bar = 2px accent + 30px bar + border — allow the JS shrink.
const MIN_H: f64 = 32.0;
const MAX_W: f64 = 420.0;
const MAX_H: f64 = 900.0;
/// Collapsed bar height. Keep in sync with OverlayApp COLLAPSED_H.
const COLLAPSED_H: f64 = 34.0;

static ENABLED: AtomicBool = AtomicBool::new(true);
static POST_MATCH: AtomicBool = AtomicBool::new(true);
/// Last requested click-through. Applied on `show()` because Linux cannot
/// set this on an unrealized (hidden) GTK widget — see
/// `set_ignore_cursor_events_safe`.
static CLICK_THROUGH: AtomicBool = AtomicBool::new(false);
/// Companion window: opaque-ish, not always-on-top, user-closed, survives match end.
static COMPANION: AtomicBool = AtomicBool::new(false);
/// User closed the companion this match — stay hidden until the next match id.
static USER_CLOSED: AtomicBool = AtomicBool::new(false);
static LAST_MATCH: Mutex<String> = Mutex::new(String::new());
/// Does the app *want* the HUD on screen? Distinct from whether it is actually
/// shown: on Hyprland the compositor watcher hides it whenever Arena's
/// workspace is off screen, and this is what says whether to bring it back.
#[cfg(target_os = "linux")]
static WANT_VISIBLE: AtomicBool = AtomicBool::new(false);
/// Geometry currently applied to the promoted HUD, in logical px. `None` when
/// the HUD is not a layer surface (X11, Windows, macOS, `FND_LAYER_SHELL=0`),
/// which is also how the frontend picks its drag and resize mode.
///
/// Tracked here rather than read back from the window, because a layer surface
/// answers neither question honestly: it is never told its own position, and
/// `outerSize` reports an origin-sized rectangle rather than what was actually
/// committed. Persisting that reply is what shrank the HUD to `MIN_W` on every
/// save. These are the values we asked the compositor for, which are the ones
/// the next launch must be given back.
#[cfg(target_os = "linux")]
static LAYER_GEOMETRY: Mutex<Option<LayerGeometry>> = Mutex::new(None);

/// Position *and* size of the promoted HUD — see [`LAYER_GEOMETRY`].
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
pub struct OverlayGeometry {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    /// Expanded-panel height (never the collapsed bar). Restored when opening
    /// the deck list; the collapsed bar always uses a fixed chrome height.
    pub height: f64,
    /// Last user-facing mode: expanded deck list vs minimized bar.
    /// Missing in older files → treated as collapsed (product default).
    #[serde(default)]
    pub expanded: bool,
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

fn persist_enabled(app: &AppHandle, enabled: bool) {
    if let Some(path) = enabled_path(app) {
        if let Some(dir) = path.parent() {
            let _ = fs::create_dir_all(dir);
        }
        let _ = fs::write(path, if enabled { b"1" as &[u8] } else { b"0" });
    }
}

fn post_match_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|d| d.join(POST_MATCH_FILE))
}

/// Post-match summary toggle (default on). When on, the tracker lets the
/// "ended" live frame linger (~12s vs a 2.8s flash) so the overlay can show
/// the result card with season form + rank path.
pub fn load_post_match(app: &AppHandle) {
    let on = post_match_path(app)
        .and_then(|p| fs::read_to_string(p).ok())
        .map(|s| {
            let t = s.trim();
            t != "0" && !t.eq_ignore_ascii_case("false")
        })
        .unwrap_or(true);
    POST_MATCH.store(on, Ordering::SeqCst);
}

pub fn is_post_match_enabled() -> bool {
    POST_MATCH.load(Ordering::SeqCst)
}

pub fn is_companion() -> bool {
    COMPANION.load(Ordering::SeqCst)
}

fn mode_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join(MODE_FILE))
}

pub fn parse_companion_mode(s: &str) -> bool {
    let t = s.trim();
    t.eq_ignore_ascii_case("companion") || t == "1" || t.eq_ignore_ascii_case("true")
}

pub fn load_window_mode(app: &AppHandle) {
    let companion = mode_path(app)
        .and_then(|p| fs::read_to_string(p).ok())
        .map(|s| parse_companion_mode(&s))
        .unwrap_or(false);
    COMPANION.store(companion, Ordering::SeqCst);
}

fn persist_window_mode(app: &AppHandle, companion: bool) {
    if let Some(path) = mode_path(app) {
        if let Some(dir) = path.parent() {
            let _ = fs::create_dir_all(dir);
        }
        let _ = fs::write(
            path,
            if companion {
                b"companion" as &[u8]
            } else {
                b"overlay" as &[u8]
            },
        );
    }
}

fn apply_chrome(app: &AppHandle) {
    let companion = is_companion();
    if let Some(win) = app.get_webview_window(OVERLAY_LABEL) {
        let _ = win.set_always_on_top(!companion);
        let _ = win.set_skip_taskbar(!companion);
        let _ = win.set_title(if companion {
            "Filthy Net Deck — Match"
        } else {
            "Filthy Net Deck — Overlay"
        });
        if companion {
            crate::set_ignore_cursor_events_safe(&win, false);
        }
    }
}

pub fn set_window_mode(app: &AppHandle, companion: bool) {
    let prev = COMPANION.swap(companion, Ordering::SeqCst);
    persist_window_mode(app, companion);
    if prev != companion {
        USER_CLOSED.store(false, Ordering::SeqCst);
    }
    apply_chrome(app);
}

pub fn set_post_match(app: &AppHandle, enabled: bool) {
    POST_MATCH.store(enabled, Ordering::SeqCst);
    if let Some(path) = post_match_path(app) {
        if let Some(dir) = path.parent() {
            let _ = fs::create_dir_all(dir);
        }
        let _ = fs::write(path, if enabled { b"1" as &[u8] } else { b"0" });
    }
}

fn load_geometry(app: &AppHandle) -> Option<OverlayGeometry> {
    let path = geometry_path(app)?;
    let text = fs::read_to_string(path).ok()?;
    let g: OverlayGeometry = serde_json::from_str(&text).ok()?;
    // Expanded height must stay tall enough to show the list; clamp floor to
    // the expanded minimum so a bad write of the collapsed bar height (32–34)
    // cannot brick the panel open-as-tiny forever.
    const MIN_EXPANDED_H: f64 = 120.0;
    let height = if g.expanded {
        g.height.clamp(MIN_EXPANDED_H, MAX_H)
    } else {
        // File stores expanded height even when last mode was collapsed.
        g.height.clamp(MIN_EXPANDED_H, MAX_H)
    };
    Some(OverlayGeometry {
        x: g.x,
        y: g.y,
        width: g.width.clamp(MIN_W, MAX_W),
        height,
        expanded: g.expanded,
    })
}

fn save_geometry(app: &AppHandle, g: &OverlayGeometry) {
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

/// True when enough of the panel's title bar overlaps a monitor to grab it
/// with the mouse. Saved geometry from an unplugged monitor / changed layout
/// fails this and falls back to the OS default position (size is kept).
fn geometry_reachable(geo: &OverlayGeometry, monitors: &[MonitorRect]) -> bool {
    const GRAB_W: f64 = 40.0;
    const BAR_H: f64 = 34.0;
    monitors.iter().any(|&(mx, my, mw, mh)| {
        let overlap_w = (geo.x + geo.width).min(mx + mw) - geo.x.max(mx);
        let overlap_h = (geo.y + BAR_H).min(my + mh) - geo.y.max(my);
        overlap_w >= GRAB_W && overlap_h >= BAR_H / 2.0
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

/// Ensure the overlay webview exists (hidden until shown).
pub fn ensure_window(app: &AppHandle) -> Result<(), String> {
    if app.get_webview_window(OVERLAY_LABEL).is_some() {
        return Ok(());
    }
    if crate::refuse_if_main_thread("overlay::ensure_window") {
        return Err("refused: webview build on the main thread".into());
    }
    let geo = load_geometry(app);
    // Monitor layout changed since the save → keep the size, drop the position.
    let pos_ok = geo.as_ref().is_some_and(|g| {
        let rects = monitor_rects(app);
        rects.is_empty() || geometry_reachable(g, &rects)
    });
    // Open in the last mode the user left the panel in. Height on disk is the
    // *expanded* height; the collapsed bar uses a fixed chrome height so a
    // restart does not flash a tall empty column before JS boots.
    let (w, h, expanded) = geo
        .as_ref()
        .map(|g| {
            // WebKitGTK will not later shrink a window created tall (~200px
            // min). Always map at the bar; JS expands once live data is in.
            #[cfg(target_os = "linux")]
            let h = COLLAPSED_H;
            #[cfg(not(target_os = "linux"))]
            let h = if g.expanded { g.height } else { COLLAPSED_H };
            (g.width, h, g.expanded)
        })
        .unwrap_or((DEFAULT_W, COLLAPSED_H, false));
    let _ = expanded; // JS re-syncs compact state from geometry on mount

    let companion = is_companion();
    let url = WebviewUrl::App("index.html#/overlay".into());
    let builder = WebviewWindowBuilder::new(app, OVERLAY_LABEL, url)
        .title(if companion {
            "Filthy Net Deck — Match"
        } else {
            "Filthy Net Deck — Overlay"
        })
        .inner_size(w, h)
        .min_inner_size(MIN_W, MIN_H)
        .max_inner_size(MAX_W, MAX_H)
        .resizable(true)
        .decorations(false)
        .always_on_top(!companion)
        .skip_taskbar(!companion)
        .visible(false)
        .focused(false);

    // `transparent` is Windows/Linux-only in Tauri 2 — macOS has no such
    // builder method (this exact call broke the v1.3.x dmg CI builds).
    // macOS gets a square, opaque panel via the .overlay-macos CSS instead.
    // Companion stays opaque so it reads as a normal window on the other
    // monitor, not a HUD over Arena.
    #[cfg(not(target_os = "macos"))]
    let builder = builder.transparent(!companion);

    let builder = match &geo {
        Some(g) if pos_ok => builder.position(g.x, g.y),
        _ => builder,
    };

    let win = builder.build().map_err(|e| e.to_string())?;

    // The match HUD has to outrank Arena, and on Wayland a toplevel cannot:
    // `always_on_top` is a no-op and Hyprland refuses to pin this window, so it
    // ends up behind the game. The overlay layer outranks every window, which is
    // the only thing that reliably keeps the HUD in front.
    //
    // Companion mode is excluded on purpose — that one is meant to be an
    // ordinary alt-tabbable window, not a HUD.
    //
    // Placement: a layer surface is positioned by anchors and margins rather
    // than absolute coordinates, so the saved x/y is carried over as a top-left
    // margin. Keyboard stays off so Arena never loses key input mid-match.
    //
    // Dragging and resizing move to `src/overlay/layerDrag.ts` from here:
    // `data-tauri-drag-region` and `startResizeDragging` are both xdg_toplevel
    // requests, which a layer surface cannot serve, so the frontend rewrites
    // these margins and calls `overlay_set_extent` instead.
    #[cfg(target_os = "linux")]
    if !companion {
        let (mx, my) = match &geo {
            Some(g) if pos_ok => (g.x as i32, g.y as i32),
            _ => (16, 16),
        };
        let promoted = crate::layer_shell::promote(
            &win,
            crate::layer_shell::Placement::top_left(mx, my, (w, h)),
        );
        // Seed from what was actually applied. Note the position is the clamped
        // pair, not `geo.x/y` — a stranded saved position falls back to (16, 16)
        // above, and the frontend must drag from where the HUD really is rather
        // than from the position that was rejected. `w`/`h` are the size this
        // window was built at, so the frontend has a trustworthy size from the
        // first render, before anything has called `overlay_set_extent`.
        *LAYER_GEOMETRY.lock().unwrap() = promoted.then_some(LayerGeometry {
            left: mx as f64,
            top: my as f64,
            width: w,
            height: h,
        });
    }
    let _ = &win;

    Ok(())
}

pub fn show(app: &AppHandle) {
    if !is_enabled() {
        return;
    }
    #[cfg(target_os = "linux")]
    WANT_VISIBLE.store(true, Ordering::SeqCst);
    // Arena is on a workspace that is not on screen — see `crate::hypr`. The
    // intent above is recorded first, so the HUD reappears with the game.
    #[cfg(target_os = "linux")]
    if !crate::hypr::surfaces_visible() {
        return;
    }
    if let Err(e) = ensure_window(app) {
        eprintln!("[overlay] ensure_window: {e}");
        return;
    }
    apply_chrome(app);
    if let Some(win) = app.get_webview_window(OVERLAY_LABEL) {
        let _ = win.show();
        // Overlay never steals Arena input. Companion may, so the user can
        // alt-tab to it — but still don't yank focus on auto-show.
        if is_companion() {
            let _ = win.unminimize();
        }
        apply_click_through_after_show(&win);
    }
}

fn apply_click_through_after_show(win: &tauri::WebviewWindow) {
    if is_companion() {
        crate::set_ignore_cursor_events_after_show(win, false);
        return;
    }
    crate::set_ignore_cursor_events_after_show(win, CLICK_THROUGH.load(Ordering::SeqCst));
}

fn apply_click_through(win: &tauri::WebviewWindow) {
    if is_companion() {
        crate::set_ignore_cursor_events_safe(win, false);
        return;
    }
    crate::set_ignore_cursor_events_safe(win, CLICK_THROUGH.load(Ordering::SeqCst));
}

/// Show for this match. Companion: if the user closed the window, stay hidden
/// until `match_id` changes (next game). Overlay: always show.
pub fn show_for_match(app: &AppHandle, match_id: &str) {
    if is_companion() {
        let mut last = LAST_MATCH.lock().unwrap_or_else(|e| e.into_inner());
        if last.as_str() != match_id {
            last.clear();
            last.push_str(match_id);
            USER_CLOSED.store(false, Ordering::SeqCst);
        }
        if USER_CLOSED.load(Ordering::SeqCst) {
            return;
        }
    }
    show(app);
}

pub fn hide(app: &AppHandle) {
    // Companion stays up after the match unless the user closed it.
    if is_companion() && !USER_CLOSED.load(Ordering::SeqCst) {
        return;
    }
    #[cfg(target_os = "linux")]
    WANT_VISIBLE.store(false, Ordering::SeqCst);
    if let Some(win) = app.get_webview_window(OVERLAY_LABEL) {
        let _ = win.hide();
    }
}

/// Follow Arena on and off screen — see `crate::hypr`. Companion mode is left
/// alone: it is an ordinary alt-tabbable window that was never promoted, so it
/// still belongs to a workspace like anything else.
#[cfg(target_os = "linux")]
pub fn apply_surface_visibility(app: &AppHandle) {
    if is_companion() {
        return;
    }
    if crate::hypr::surfaces_visible() {
        if WANT_VISIBLE.load(Ordering::SeqCst) {
            show(app);
        }
        return;
    }
    if let Some(win) = app.get_webview_window(OVERLAY_LABEL) {
        let _ = win.hide();
    }
}

/// User hit the companion close button. Hidden until the next match.
pub fn user_close(app: &AppHandle) {
    USER_CLOSED.store(true, Ordering::SeqCst);
    if let Some(win) = app.get_webview_window(OVERLAY_LABEL) {
        let _ = win.hide();
    }
}

/// Arena quit: drop the HUD. Companion stays if the user left it open —
/// that's the "I close it myself" contract.
pub fn on_arena_quit(app: &AppHandle) {
    if is_companion() && !USER_CLOSED.load(Ordering::SeqCst) {
        return;
    }
    destroy(app);
}

/// Drop the overlay webview, freeing its renderer process — see
/// [`crate::drop_secondary_webview`]. Match mid-session still uses [`hide`],
/// which keeps the HUD warm between games.
pub fn destroy(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(OVERLAY_LABEL) {
        crate::drop_secondary_webview(&win);
    }
}

/// Build the overlay webview (hidden) so the first match of a session is snappy.
/// Only call while Arena is running and the overlay is enabled.
pub fn prewarm_if_enabled(app: &AppHandle) {
    if !is_enabled() {
        return;
    }
    if let Err(e) = ensure_window(app) {
        eprintln!("[overlay] prewarm: {e}");
    }
}

pub fn set_enabled(app: &AppHandle, enabled: bool) {
    ENABLED.store(enabled, Ordering::SeqCst);
    persist_enabled(app, enabled);
    if !enabled {
        destroy(app);
    }
}

#[tauri::command]
pub fn overlay_set_enabled(app: AppHandle, enabled: bool) {
    set_enabled(&app, enabled);
}

#[tauri::command]
pub fn overlay_set_post_match(app: AppHandle, enabled: bool) {
    set_post_match(&app, enabled);
}

#[tauri::command]
pub fn overlay_is_enabled() -> bool {
    is_enabled()
}

#[tauri::command]
pub fn overlay_get_geometry(app: AppHandle) -> Option<OverlayGeometry> {
    load_geometry(&app)
}

/// Persist size/position/mode after the user drags, resizes, snaps, or toggles.
#[tauri::command]
pub fn overlay_save_geometry(app: AppHandle, geometry: OverlayGeometry) {
    // Never persist the collapsed bar height as the expanded height — that
    // made the next expand open a ~34px stub the user then had to fight.
    const MIN_EXPANDED_H: f64 = 120.0;
    let height = geometry.height.max(MIN_EXPANDED_H).clamp(MIN_H, MAX_H);
    let g = OverlayGeometry {
        x: geometry.x,
        y: geometry.y,
        width: geometry.width.clamp(MIN_W, MAX_W),
        height,
        expanded: geometry.expanded,
    };
    save_geometry(&app, &g);
}

/// Where the promoted HUD sits and how big it is, in logical px — or `null`
/// when it is an ordinary window.
///
/// The frontend uses the null-ness to choose its input mode: `null` keeps wry's
/// `data-tauri-drag-region` and `startResizeDragging`, a value switches to the
/// margin drag and the extent-based resize. It must be asked rather than
/// inferred, because promotion can decline at runtime.
#[tauri::command]
pub fn overlay_layer_geometry() -> Option<LayerGeometryDto> {
    #[cfg(target_os = "linux")]
    {
        *LAYER_GEOMETRY.lock().unwrap()
    }
    #[cfg(not(target_os = "linux"))]
    {
        None
    }
}

/// `LayerGeometry` only exists on Linux; everywhere else the command still has
/// to name a type, and it always answers `None`.
#[cfg(target_os = "linux")]
pub type LayerGeometryDto = LayerGeometry;
#[cfg(not(target_os = "linux"))]
pub type LayerGeometryDto = ();

/// Move the promoted HUD. Returns false when this window is not a layer
/// surface, so the caller can fall back to `set_position`.
///
/// This exists because a layer surface has no move request at all — see
/// `layer_shell::set_margins`. Edge snapping rides on the same path: the
/// frontend rounds the margins to the screen edge and calls this again.
#[tauri::command]
pub fn overlay_set_margins(app: AppHandle, left: f64, top: f64) -> bool {
    #[cfg(target_os = "linux")]
    {
        let Some(win) = app.get_webview_window(OVERLAY_LABEL) else {
            return false;
        };
        if !crate::layer_shell::set_margins(&win, left, top) {
            return false;
        }
        // Store the clamped values, matching what the compositor was given, so
        // a later drag does not resume from an off-screen number.
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

/// Resize the HUD. `compact` clamps min=max to the bar so GTK cannot keep
/// the last expanded size. On Hyprland we also dispatch a compositor resize
/// because Wayland clients cannot rely on `set_size` alone.
#[tauri::command]
pub fn overlay_set_extent(app: AppHandle, width: f64, height: f64, compact: bool) {
    let w = width.clamp(MIN_W, MAX_W);
    let h = if compact {
        COLLAPSED_H
    } else {
        height.clamp(MIN_H, MAX_H).max(120.0)
    };
    let Some(win) = app.get_webview_window(OVERLAY_LABEL) else {
        return;
    };
    if compact {
        let _ = win.set_max_size(Some(LogicalSize::new(MAX_W, COLLAPSED_H)));
        let _ = win.set_min_size(Some(LogicalSize::new(MIN_W, COLLAPSED_H)));
    } else {
        let _ = win.set_min_size(Some(LogicalSize::new(MIN_W, 120.0)));
        let _ = win.set_max_size(Some(LogicalSize::new(MAX_W, MAX_H)));
    }
    let _ = win.set_size(LogicalSize::new(w, h));
    #[cfg(target_os = "linux")]
    {
        // A promoted HUD is a layer surface, which sizes itself from the GTK
        // window's request rather than an xdg_toplevel configure — so the
        // hyprctl path below cannot see it (it matches a toplevel by title) and
        // would silently do nothing. Try the layer-shell resize first and only
        // fall back when this window is not promoted.
        if crate::layer_shell::resize(&win, w, h) {
            // Same reason as the margins: this is the only honest record of the
            // surface's size, and `persistGeometry` reads it back.
            if let Some(g) = LAYER_GEOMETRY.lock().unwrap().as_mut() {
                g.width = w;
                g.height = h;
            }
        } else {
            hyprland_force_size(&win, w, h);
        }
    }
}

#[cfg(target_os = "linux")]
fn hyprland_force_size(win: &tauri::WebviewWindow, w: f64, h: f64) {
    if std::env::var_os("HYPRLAND_INSTANCE_SIGNATURE").is_none() {
        return;
    }
    let title = win
        .title()
        .unwrap_or_else(|_| "Filthy Net Deck — Overlay".into());
    let w = w.round().clamp(1.0, 8000.0) as i32;
    let h = h.round().clamp(1.0, 8000.0) as i32;
    let expr = format!(
        "hl.dsp.window.resize({{ x = {w}, y = {h}, relative = false, window = \"title:{title}\" }})"
    );
    // Dropping the `Child` without waiting leaves a zombie behind, and this
    // fires on every overlay resize — they accumulate for the whole session.
    // Reap on a detached thread so the caller never blocks on hyprctl.
    if let Ok(mut child) = std::process::Command::new("hyprctl")
        .args(["dispatch", &expr])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
    {
        std::thread::spawn(move || {
            let _ = child.wait();
        });
    }
}

/// Passive-HUD mode: the overlay window ignores cursor events so clicks fall
/// through to the game. The overlay webview re-applies this from prefs on
/// mount and on every prefs push, so the window always exists here.
#[tauri::command]
pub fn overlay_set_click_through(app: AppHandle, ignore: bool) {
    // Linux GTK cannot punch clicks through a transparent window, and asking
    // while the widget is hidden aborts the process. The UI hides the toggle
    // there; this is the belt if an old pref or a stale webview still asks.
    #[cfg(target_os = "linux")]
    let ignore = {
        let _ = ignore;
        false
    };
    CLICK_THROUGH.store(ignore, Ordering::SeqCst);
    if let Some(win) = app.get_webview_window(OVERLAY_LABEL) {
        apply_click_through(&win);
    }
}

#[tauri::command]
pub fn overlay_set_window_mode(app: AppHandle, companion: bool) {
    set_window_mode(&app, companion);
}

#[tauri::command]
pub fn overlay_user_close(app: AppHandle) {
    user_close(&app);
}

#[tauri::command]
pub fn overlay_is_companion() -> bool {
    is_companion()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn geo(x: f64, y: f64) -> OverlayGeometry {
        OverlayGeometry {
            x,
            y,
            width: 228.0,
            height: 300.0,
            expanded: true,
        }
    }

    #[test]
    fn geometry_reachable_detects_stranded_positions() {
        let one = [(0.0, 0.0, 1920.0, 1080.0)];
        assert!(geometry_reachable(&geo(100.0, 50.0), &one));
        // Fully on an unplugged side display.
        assert!(!geometry_reachable(&geo(-2400.0, 50.0), &one));
        // A grabbable sliver on the right edge still counts.
        assert!(geometry_reachable(&geo(1880.0, 0.0), &one));
        // Title bar entirely above the top edge — can't be grabbed.
        assert!(!geometry_reachable(&geo(100.0, -60.0), &one));
        // A second monitor with negative coords rescues the same position.
        let two = [(0.0, 0.0, 1920.0, 1080.0), (-2560.0, 0.0, 2560.0, 1440.0)];
        assert!(geometry_reachable(&geo(-2400.0, 50.0), &two));
    }

    #[test]
    fn parse_companion_mode_accepts_named_and_truthy() {
        assert!(parse_companion_mode("companion"));
        assert!(parse_companion_mode("Companion"));
        assert!(parse_companion_mode("1"));
        assert!(!parse_companion_mode("overlay"));
        assert!(!parse_companion_mode(""));
        assert!(!parse_companion_mode("0"));
        assert!(!parse_companion_mode("false"));
    }
}
