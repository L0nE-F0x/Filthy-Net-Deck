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
const GEOMETRY_FILE: &str = "overlay-geometry.json";

/// Slim column; short default matches collapsed bar (+ room to expand).
const DEFAULT_W: f64 = 228.0;
const DEFAULT_H: f64 = 168.0;
const MIN_W: f64 = 180.0;
const MIN_H: f64 = 120.0;
const MAX_W: f64 = 420.0;
const MAX_H: f64 = 900.0;

static ENABLED: AtomicBool = AtomicBool::new(true);

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

/// Ensure the overlay webview exists (hidden until shown).
pub fn ensure_window(app: &AppHandle) -> Result<(), String> {
    if app.get_webview_window(OVERLAY_LABEL).is_some() {
        return Ok(());
    }
    let geo = load_geometry(app);
    let (w, h) = geo
        .as_ref()
        .map(|g| (g.width, g.height))
        .unwrap_or((DEFAULT_W, DEFAULT_H));

    let url = WebviewUrl::App("index.html#/overlay".into());
    let mut builder = WebviewWindowBuilder::new(app, OVERLAY_LABEL, url)
        .title("Filthy Net Deck — Overlay")
        .inner_size(w, h)
        .min_inner_size(MIN_W, MIN_H)
        .max_inner_size(MAX_W, MAX_H)
        .resizable(true)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .focused(false);

    if let Some(g) = geo {
        builder = builder.position(g.x, g.y);
    }

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
