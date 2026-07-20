//! Always-on-top match HUD window. Rust owns create/show/hide so the main
//! WebView can stay tray-hidden without missing match-start events.
//! Geometry (size/position) is persisted so the user can resize + edge-snap once.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const OVERLAY_LABEL: &str = "overlay";
const ENABLED_FILE: &str = "overlay-enabled";
const POST_MATCH_FILE: &str = "overlay-post-match";
const GEOMETRY_FILE: &str = "overlay-geometry.json";

/// Slim column; short default matches collapsed bar (+ room to expand).
const DEFAULT_W: f64 = 228.0;
const DEFAULT_H: f64 = 168.0;
/// Minimal density (no card art) stays readable down to ~164 logical px.
const MIN_W: f64 = 164.0;
/// Collapsed bar = 2px accent + 30px bar + border — allow the JS shrink.
const MIN_H: f64 = 32.0;
const MAX_W: f64 = 420.0;
const MAX_H: f64 = 900.0;

static ENABLED: AtomicBool = AtomicBool::new(true);
static POST_MATCH: AtomicBool = AtomicBool::new(true);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayGeometry {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
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
    Some(OverlayGeometry {
        x: g.x,
        y: g.y,
        width: g.width.clamp(MIN_W, MAX_W),
        height: g.height.clamp(MIN_H, MAX_H),
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
    let geo = load_geometry(app);
    // Monitor layout changed since the save → keep the size, drop the position.
    let pos_ok = geo.as_ref().is_some_and(|g| {
        let rects = monitor_rects(app);
        rects.is_empty() || geometry_reachable(g, &rects)
    });
    let (w, h) = geo
        .as_ref()
        .map(|g| (g.width, g.height))
        .unwrap_or((DEFAULT_W, DEFAULT_H));

    let url = WebviewUrl::App("index.html#/overlay".into());
    let builder = WebviewWindowBuilder::new(app, OVERLAY_LABEL, url)
        .title("Filthy Net Deck — Overlay")
        .inner_size(w, h)
        .min_inner_size(MIN_W, MIN_H)
        .max_inner_size(MAX_W, MAX_H)
        .resizable(true)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .focused(false);

    // `transparent` is Windows/Linux-only in Tauri 2 — macOS has no such
    // builder method (this exact call broke the v1.3.x dmg CI builds).
    // macOS gets a square, opaque panel via the .overlay-macos CSS instead.
    #[cfg(not(target_os = "macos"))]
    let builder = builder.transparent(true);

    let builder = match &geo {
        Some(g) if pos_ok => builder.position(g.x, g.y),
        _ => builder,
    };

    builder.build().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn show(app: &AppHandle) {
    if !is_enabled() {
        return;
    }
    if let Err(e) = ensure_window(app) {
        eprintln!("[overlay] ensure_window: {e}");
        return;
    }
    if let Some(win) = app.get_webview_window(OVERLAY_LABEL) {
        let _ = win.show();
        // Do not set_focus — never steal Arena input.
    }
}

pub fn hide(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(OVERLAY_LABEL) {
        let _ = win.hide();
    }
}

pub fn set_enabled(app: &AppHandle, enabled: bool) {
    ENABLED.store(enabled, Ordering::SeqCst);
    persist_enabled(app, enabled);
    if !enabled {
        hide(app);
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

/// Persist size/position after the user drags, resizes, or edge-snaps.
#[tauri::command]
pub fn overlay_save_geometry(app: AppHandle, geometry: OverlayGeometry) {
    let g = OverlayGeometry {
        x: geometry.x,
        y: geometry.y,
        width: geometry.width.clamp(MIN_W, MAX_W),
        height: geometry.height.clamp(MIN_H, MAX_H),
    };
    save_geometry(&app, &g);
}

/// Passive-HUD mode: the overlay window ignores cursor events so clicks fall
/// through to the game. The overlay webview re-applies this from prefs on
/// mount and on every prefs push, so the window always exists here.
#[tauri::command]
pub fn overlay_set_click_through(app: AppHandle, ignore: bool) {
    if let Some(win) = app.get_webview_window(OVERLAY_LABEL) {
        let _ = win.set_ignore_cursor_events(ignore);
    }
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
}
