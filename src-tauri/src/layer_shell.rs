//! wlr-layer-shell promotion for the always-on-top surfaces. Linux/Wayland only.
//!
//! Why this exists: on Wayland a client cannot raise itself — there is no
//! protocol for it — so Tauri's `always_on_top` and `skip_taskbar` are no-ops,
//! and Hyprland's `pin` buys stacking without input. A surface on the layer
//! shell's `overlay` layer is the one thing that sits above a fullscreen
//! window *and* accepts input; it is the same mechanism the Omarchy bar uses.
//!
//! Hiding a promoted surface must **not** unmap it. On Hyprland 0.56.2, unmapping
//! an overlay surface while Arena (XWayland) fills the focused workspace leaves
//! every overlay client unable to receive `wl_pointer` until something else
//! resets the seat. The badge and HUD stay mapped and are parked off the output
//! instead; see `conceal` / `reveal`.
//!
//! Hard constraint: `gtk_layer_init_for_window` must run before the GtkWindow
//! is realized. tao only calls `show_all()` when a window is built visible
//! (`platform_impl/linux/window.rs`), and every surface here is built
//! `.visible(false)`, so the window is still unrealized when `build()` returns.
//! `promote` must therefore be called immediately after `build()` and never
//! after `show()`. It checks `is_realized()` and refuses rather than risking
//! the GTK abort path described in `set_ignore_cursor_events_safe`.

use gtk::prelude::{GtkWindowExt, WidgetExt};
use gtk_layer_shell::{Edge, KeyboardMode, Layer, LayerShell};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::Manager;

/// Last placement we asked the compositor for, keyed by window label.
/// `conceal` parks a surface off-screen without unmapping; `reveal` puts
/// these values back. Updated on promote / resize / set_margins.
static PLACEMENTS: Mutex<Option<HashMap<String, Placement>>> = Mutex::new(None);

/// Bigger than any output we will see, so a parked surface cannot be hit.
const PARK_MARGIN: i32 = 50_000;

/// Where a promoted surface sits on its output, in logical px.
///
/// There is deliberately no keyboard knob. `KeyboardMode::OnDemand` was
/// measured and rejected: Hyprland consumes the click that would hand the
/// surface focus, Arena immediately takes focus back, and the round trip eats
/// every button press — the surfaces looked dead. None of these windows is a
/// text field, and the Omarchy bar is clickable while asking for no keyboard
/// either, so `None` is both correct and the only mode that works.
#[derive(Clone, Copy)]
pub struct Placement {
    pub left: bool,
    pub right: bool,
    pub top: bool,
    pub bottom: bool,
    pub margin_x: i32,
    pub margin_y: i32,
    /// Size the surface must actually commit, in logical px.
    ///
    /// Not optional, because getting it wrong is invisible and expensive:
    /// WebKitGTK refuses to lay out much under 200x200, so a 158x40 badge
    /// becomes a 200x200 surface with ~160px of transparent, *click-eating*
    /// padding sitting over the game. As an ordinary window Hyprland's
    /// `max_size` rule clipped that away; a layer surface gets no window rules,
    /// so the size has to be forced here instead.
    pub size: (f64, f64),
}

impl Placement {
    /// Top-right corner, matching `toast::corner_position` and the
    /// `move = "monitor_w-window_w-16 16"` rule in the packaged Hyprland
    /// config. Anchoring means the compositor re-corners it on a resolution
    /// change for free, which the old explicit `set_position` had to redo on
    /// every show.
    pub fn top_right(margin: i32, size: (f64, f64)) -> Self {
        Self {
            left: false,
            right: true,
            top: true,
            bottom: false,
            margin_x: margin,
            margin_y: margin,
            size,
        }
    }

    /// Top-left corner with explicit margins — used to honour the HUD's saved
    /// x/y, since a layer surface is placed by anchors and margins rather than
    /// absolute coordinates.
    pub fn top_left(x: i32, y: i32, size: (f64, f64)) -> Self {
        Self {
            left: true,
            right: false,
            top: true,
            bottom: false,
            margin_x: x.max(0),
            margin_y: y.max(0),
            size,
        }
    }
}

/// On by default under Wayland; X11 sessions keep the plain-toplevel path
/// untouched. `FND_LAYER_SHELL=0` forces it off if a surface ever misbehaves,
/// so there is always a way back without a rebuild.
pub fn enabled() -> bool {
    std::env::var_os("WAYLAND_DISPLAY").is_some()
        && !std::env::var("FND_LAYER_SHELL").is_ok_and(|v| v == "0")
}

/// Promote a freshly built, still-hidden window to a layer surface.
/// Returns false if it was skipped, so callers keep their existing behaviour.
///
/// Threading: `gtk_layer_init_for_window` asserts the GTK main thread, but every
/// window here is deliberately built on a worker thread — building on the main
/// thread deadlocks the Windows event loop (see `refuse_if_main_thread`). So we
/// hop the other way and *block* until it lands: the promotion must be complete
/// before anything calls `show()`, because init must precede realize.
pub fn promote(win: &tauri::WebviewWindow, place: Placement) -> bool {
    if !enabled() {
        return false;
    }
    on_gtk_main(win, move |win| apply(win, place))
}

/// Resize a promoted surface. A layer surface takes its size from the GTK
/// window's request, not from an xdg_toplevel configure, so `hyprland_force_size`
/// (which resizes a *toplevel by title* through hyprctl) is a no-op once
/// promoted — this replaces it for the collapse/expand toggle.
///
/// Returns false when the window is not a layer surface, so the caller can fall
/// back to its existing path.
pub fn resize(win: &tauri::WebviewWindow, w: f64, h: f64) -> bool {
    if !enabled() {
        return false;
    }
    let w = w.round().clamp(1.0, 8000.0) as i32;
    let h = h.round().clamp(1.0, 8000.0) as i32;
    on_gtk_main(win, move |win| {
        let Ok(gtk_win) = win.gtk_window() else {
            return false;
        };
        if !gtk_win.is_layer_window() {
            return false;
        }
        force_size(&gtk_win, w, h);
        if let Some(mut place) = remembered(win) {
            place.size = (w as f64, h as f64);
            remember(win, place);
        }
        true
    })
}

/// Pin a GTK window to an exact size.
///
/// The `set_size_request(-1, -1)` first is load-bearing twice over: WebKitGTK
/// treats the largest size it has been handed as an implicit floor — which is
/// why the HUD could expand but never collapse again — and it will not lay out
/// much below 200x200 unless the old request is cleared before the new one.
fn force_size(gtk_win: &gtk::ApplicationWindow, w: i32, h: i32) {
    gtk_win.set_size_request(-1, -1);
    gtk_win.resize(w, h);
    gtk_win.set_size_request(w, h);
}

/// Move a promoted surface by rewriting its anchor margins.
///
/// A layer surface has no `xdg_toplevel`, so it has no move request either:
/// `set_position` and wry's `data-tauri-drag-region` (which issues
/// `xdg_toplevel.move`) are both silent no-ops on one. Rewriting the Left/Top
/// margins is the only way to move it, and it is what the JS drag in
/// `OverlayApp` drives.
///
/// Only Left/Top are touched — `apply` anchors the HUD to those two edges, and
/// the Right/Bottom margins it also sets are ignored while those edges are
/// unanchored.
pub fn set_margins(win: &tauri::WebviewWindow, left: f64, top: f64) -> bool {
    if !enabled() {
        return false;
    }
    // Clamp rather than reject: a drag that overshoots the screen should stop
    // at the edge, not abort and leave the HUD mid-gesture.
    let left = left.round().clamp(0.0, 20_000.0) as i32;
    let top = top.round().clamp(0.0, 20_000.0) as i32;
    on_gtk_main(win, move |win| {
        let Ok(gtk_win) = win.gtk_window() else {
            return false;
        };
        if !gtk_win.is_layer_window() {
            return false;
        }
        gtk_win.set_layer_shell_margin(Edge::Left, left);
        gtk_win.set_layer_shell_margin(Edge::Top, top);
        if let Some(mut place) = remembered(win) {
            place.margin_x = left;
            place.margin_y = top;
            remember(win, place);
        }
        true
    })
}

/// Try to take the top of the overlay layer.
///
/// wlr-layer-shell has no raise request, and `set_layer` back to the same
/// layer does not restack on Hyprland 0.56.2. The only protocol-legal way up
/// is unmap/map, and that is exactly what deafens every overlay client while
/// Arena fills the focused workspace. So this is a deliberate no-op: a
/// notification may bury the HUD, and that is better than a 19-minute
/// pointer blackout. Workspace hide/show uses `conceal` / `reveal` instead.
pub fn remap(win: &tauri::WebviewWindow) -> bool {
    let _ = win;
    false
}

/// Did this window actually become a layer surface? Promotion can decline —
/// X11, `FND_LAYER_SHELL=0`, or a window tao realized during `build()` — so ask
/// the window instead of assuming `enabled()` means it happened. The frontend
/// uses this to pick between the native drag and the margin drag.
pub fn is_promoted(win: &tauri::WebviewWindow) -> bool {
    if !enabled() {
        return false;
    }
    on_gtk_main(win, |win| {
        win.gtk_window().is_ok_and(|w| w.is_layer_window())
    })
}

/// Run `f` on the GTK main thread and wait for it. GTK asserts the main thread,
/// but these calls arrive from both worker threads (window creation) and
/// `#[tauri::command]`s (which already run on main), so handle both.
fn on_gtk_main<F>(win: &tauri::WebviewWindow, f: F) -> bool
where
    F: FnOnce(&tauri::WebviewWindow) -> bool + Send + 'static,
{
    if crate::on_main_thread() {
        return f(win);
    }
    let (tx, rx) = std::sync::mpsc::channel();
    let cloned = win.clone();
    if win
        .app_handle()
        .run_on_main_thread(move || {
            let _ = tx.send(f(&cloned));
        })
        .is_err()
    {
        return false;
    }
    rx.recv_timeout(std::time::Duration::from_secs(5))
        .unwrap_or(false)
}

fn apply(win: &tauri::WebviewWindow, place: Placement) -> bool {
    let Ok(gtk_win) = win.gtk_window() else {
        eprintln!("[layer-shell] {}: no gtk window", win.label());
        return false;
    };

    // The whole spike turns on this line. If tao/wry realized the window during
    // build() there is no safe way back and we must not touch it.
    if gtk_win.is_realized() {
        eprintln!(
            "[layer-shell] {}: already realized at build() — cannot init",
            win.label()
        );
        return false;
    }

    gtk_win.init_layer_shell();
    gtk_win.set_layer(Layer::Overlay);
    gtk_win.set_namespace("filthy-net-deck");

    // See the note on `Placement`: anything but `None` eats every click.
    gtk_win.set_keyboard_mode(KeyboardMode::None);

    // Never reserve space: an exclusive zone would shove Arena and the Omarchy
    // bar out of the way, which is the opposite of an overlay.
    gtk_win.set_exclusive_zone(-1);

    apply_placement(&gtk_win, place);
    remember(win, place);

    eprintln!("[layer-shell] {}: promoted to overlay layer", win.label());
    true
}

fn remember(win: &tauri::WebviewWindow, place: Placement) {
    PLACEMENTS
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .get_or_insert_with(HashMap::new)
        .insert(win.label().to_string(), place);
}

fn remembered(win: &tauri::WebviewWindow) -> Option<Placement> {
    let label = win.label().to_string();
    PLACEMENTS
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .as_ref()
        .and_then(|m| m.get(&label).copied())
}

fn apply_placement(gtk_win: &gtk::ApplicationWindow, place: Placement) {
    for (edge, on) in [
        (Edge::Left, place.left),
        (Edge::Right, place.right),
        (Edge::Top, place.top),
        (Edge::Bottom, place.bottom),
    ] {
        gtk_win.set_anchor(edge, on);
    }
    // `set_layer_shell_margin`, not `set_margin` — the latter is GTK's own
    // widget margin and would silently do the wrong thing.
    gtk_win.set_layer_shell_margin(Edge::Left, place.margin_x);
    gtk_win.set_layer_shell_margin(Edge::Right, place.margin_x);
    gtk_win.set_layer_shell_margin(Edge::Top, place.margin_y);
    gtk_win.set_layer_shell_margin(Edge::Bottom, place.margin_y);
    let (w, h) = place.size;
    force_size(
        gtk_win,
        w.round().clamp(1.0, 8000.0) as i32,
        h.round().clamp(1.0, 8000.0) as i32,
    );
}

/// Hide a promoted surface without unmapping it.
///
/// `GtkWindow::hide` destroys the layer surface. On Hyprland 0.56.2 that
/// unmap, done while Arena fills the focused workspace, is what stops *every*
/// overlay client receiving pointer events — measured 2026-09-18: a fresh
/// painted probe was deaf on Arena's workspace and immediately clickable the
/// moment Arena left the screen. Parking with huge margins keeps the same
/// `wl_surface` alive, so the seat never has to recover from a destroy.
///
/// Returns false when this window is not a mapped layer surface, so the
/// caller can fall back to `hide()`.
pub fn conceal(win: &tauri::WebviewWindow) -> bool {
    if !enabled() || !win.is_visible().unwrap_or(false) || !is_promoted(win) {
        return false;
    }
    on_gtk_main(win, |win| {
        let Ok(gtk_win) = win.gtk_window() else {
            return false;
        };
        if !gtk_win.is_layer_window() {
            return false;
        }
        for edge in [Edge::Left, Edge::Right, Edge::Top, Edge::Bottom] {
            gtk_win.set_layer_shell_margin(edge, PARK_MARGIN);
        }
        true
    })
}

/// Put a parked surface back at its last requested placement.
///
/// No-op (and returns false) when the window is not a layer surface or we
/// have no placement to restore. Does not `show()` — the caller owns that.
pub fn reveal(win: &tauri::WebviewWindow) -> bool {
    if !enabled() || !is_promoted(win) {
        return false;
    }
    let Some(place) = remembered(win) else {
        return false;
    };
    on_gtk_main(win, move |win| {
        let Ok(gtk_win) = win.gtk_window() else {
            return false;
        };
        if !gtk_win.is_layer_window() {
            return false;
        }
        apply_placement(&gtk_win, place);
        true
    })
}

/// Update anchors, margins and size on an already-promoted surface.
pub fn reapply(win: &tauri::WebviewWindow, place: Placement) -> bool {
    if !enabled() || !is_promoted(win) {
        return false;
    }
    on_gtk_main(win, move |win| {
        let Ok(gtk_win) = win.gtk_window() else {
            return false;
        };
        if !gtk_win.is_layer_window() {
            return false;
        }
        apply_placement(&gtk_win, place);
        remember(win, place);
        true
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn park_margin_clears_even_an_8k_output() {
        // A parked surface with this margin cannot overlap a 7680×4320 panel.
        assert!(PARK_MARGIN as i64 > 7680);
    }
}
