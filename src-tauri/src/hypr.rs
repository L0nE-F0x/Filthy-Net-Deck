//! Hyprland IPC — keeps the promoted surfaces on Arena's workspace.
//!
//! Why this exists: a wlr-layer-shell surface is attached to an *output*, not a
//! workspace. That is the whole point of the protocol — it is how a bar stays
//! put while you switch desktops — but it means the promoted badge, HUD, cog
//! menu and match alert are visible on every workspace, floating over whatever
//! else you are doing. As ordinary windows they used to be docked onto Arena's
//! workspace by the packaged Hyprland script; layer surfaces are not windows,
//! so that script cannot see them and the app has to do it itself.
//!
//! The rule: show the surfaces only while Arena is on a workspace that is
//! actually on screen. Everything here no-ops off Hyprland and off layer-shell
//! (X11, `FND_LAYER_SHELL=0`, Windows, macOS), where the windows are ordinary
//! and already belong to a workspace.
//!
//! Talks to the compositor's own sockets rather than shelling out to `hyprctl`:
//! this runs on every workspace switch, and spawning a process per switch is
//! both slower and another zombie to reap (see `overlay::hyprland_force_size`).

use std::io::{Read, Write};
use std::os::unix::net::UnixStream;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::AppHandle;

/// Arena's window class under Proton. Must match the packaged Hyprland config.
const ARENA_CLASS: &str = "steam_app_2141910";
/// The namespace `layer_shell::apply` gives every promoted surface.
const OUR_NAMESPACE: &str = "filthy-net-deck";
/// `j/layers` keys its levels by number; 3 is `overlay`, where we live.
const OVERLAY_LEVEL: &str = "3";
/// Let a newly mapped surface finish configuring before reading the stack.
/// Without this the newcomer is in the list at its pre-configure size and the
/// overlap test can miss.
const SETTLE: Duration = Duration::from_millis(150);
/// Floor on how often the surfaces may be re-mapped. Two clients that both
/// re-assert would otherwise trade the top of the layer forever.
const REASSERT_COOLDOWN: Duration = Duration::from_secs(2);
/// Arena's title before Proton reports a class, seen during startup.
const ARENA_TITLE: &str = "MTGA";

/// Is Arena on a workspace that is currently on screen? Starts `true` so that
/// nothing is hidden before the first answer arrives, and stays `true` forever
/// on setups this module does not manage.
static ARENA_ON_SCREEN: AtomicBool = AtomicBool::new(true);
/// Set while the compositor cannot be reached, so the warning is logged once
/// per outage rather than once per retry.
static ASK_FAILED: AtomicBool = AtomicBool::new(false);
/// When the surfaces were last re-mapped, for `REASSERT_COOLDOWN`.
static LAST_REASSERT: Mutex<Option<Instant>> = Mutex::new(None);

/// Should the promoted surfaces be on screen right now?
///
/// Always true unless we are actually managing this: a plain toplevel already
/// lives on a workspace, and hiding it here would fight the compositor rules
/// that put it there.
pub fn surfaces_visible() -> bool {
    if !managed() {
        return true;
    }
    ARENA_ON_SCREEN.load(Ordering::SeqCst)
}

/// Only Hyprland, and only when the surfaces are really layer surfaces.
fn managed() -> bool {
    crate::layer_shell::enabled() && signature().is_some()
}

fn signature() -> Option<String> {
    std::env::var("HYPRLAND_INSTANCE_SIGNATURE")
        .ok()
        .filter(|s| !s.is_empty())
}

fn socket(name: &str) -> Option<PathBuf> {
    let dir = std::env::var_os("XDG_RUNTIME_DIR")?;
    Some(
        PathBuf::from(dir)
            .join("hypr")
            .join(signature()?)
            .join(name),
    )
}

/// One request/response against Hyprland's command socket. `j/` prefixes ask
/// for JSON. Returns `None` rather than erroring: a missing compositor is a
/// normal state here, not a failure.
fn request(cmd: &str) -> Option<String> {
    let path = socket(".socket.sock")?;
    let mut sock = UnixStream::connect(path).ok()?;
    sock.set_read_timeout(Some(Duration::from_secs(2))).ok()?;
    sock.set_write_timeout(Some(Duration::from_secs(2))).ok()?;
    sock.write_all(cmd.as_bytes()).ok()?;
    sock.flush().ok()?;
    // Hyprland replies and closes; without this it waits for more commands.
    let _ = sock.shutdown(std::net::Shutdown::Write);
    let mut out = String::new();
    sock.read_to_string(&mut out).ok()?;
    Some(out)
}

/// Workspace ids currently displayed on some monitor — the ordinary one per
/// monitor, plus any special workspace pulled over it. The scratchpad matters:
/// Omarchy's Super+S is where this box keeps Arena, and a scratchpad Arena is
/// on screen exactly when its special workspace is the active one.
fn on_screen_workspaces(monitors: &serde_json::Value) -> Vec<i64> {
    let mut ids = Vec::new();
    for m in monitors.as_array().into_iter().flatten() {
        for key in ["activeWorkspace", "specialWorkspace"] {
            if let Some(id) = m
                .get(key)
                .and_then(|w| w.get("id"))
                .and_then(|i| i.as_i64())
            {
                // Hyprland reports id 0 for "no special workspace".
                if id != 0 {
                    ids.push(id);
                }
            }
        }
    }
    ids
}

fn is_arena(client: &serde_json::Value) -> bool {
    let class = client.get("class").and_then(|c| c.as_str()).unwrap_or("");
    let title = client.get("title").and_then(|t| t.as_str()).unwrap_or("");
    class == ARENA_CLASS || title == ARENA_TITLE
}

/// `None` when the compositor could not be asked — the caller keeps the last
/// answer rather than guessing, so a transient IPC hiccup cannot blink the HUD.
fn compute_arena_on_screen() -> Option<bool> {
    let clients: serde_json::Value = serde_json::from_str(&request("j/clients")?).ok()?;
    let monitors: serde_json::Value = serde_json::from_str(&request("j/monitors")?).ok()?;
    let visible = on_screen_workspaces(&monitors);
    Some(
        clients
            .as_array()
            .into_iter()
            .flatten()
            .filter(|c| is_arena(c))
            .any(|c| {
                c.get("workspace")
                    .and_then(|w| w.get("id"))
                    .and_then(|i| i.as_i64())
                    .is_some_and(|id| visible.contains(&id))
            }),
    )
}

/// Re-ask the compositor and, if the answer changed, push it to the surfaces.
/// Safe to call from any thread.
pub fn refresh(app: &AppHandle) {
    if !managed() {
        return;
    }
    let Some(now) = compute_arena_on_screen() else {
        // Once per outage, not once per retry: the watch loop re-asks every
        // couple of seconds, and a compositor that has gone away would
        // otherwise fill the log for as long as the app runs.
        if !ASK_FAILED.swap(true, Ordering::SeqCst) {
            eprintln!("[hypr] could not ask the compositor — keeping the last answer");
        }
        return;
    };
    ASK_FAILED.store(false, Ordering::SeqCst);
    if ARENA_ON_SCREEN.swap(now, Ordering::SeqCst) == now {
        return;
    }
    // One line per transition, so at most one per workspace switch. Worth
    // keeping: a HUD that vanished on purpose and one that crashed look
    // identical from the outside.
    eprintln!(
        "[hypr] Arena {} screen — {} the promoted surfaces",
        if now { "on" } else { "off" },
        if now { "restoring" } else { "hiding" }
    );
    // Deliberately NOT hopped to the main thread. Restoring a surface can mean
    // building its webview for the first time -- Arena may have been on another
    // workspace when it launched, so the ordinary show path was declined and
    // the window was never created. `refuse_if_main_thread` rejects a webview
    // build on the main thread (it deadlocks the Windows event loop), so
    // dispatching there made the badge impossible to ever create: the restore
    // refused every time and the badge stayed missing for the whole session.
    //
    // This is a worker thread, which is exactly where every other caller shows
    // these windows from -- the arena poll and the tracker both do. Tauri's
    // `show`/`hide` post to the event loop themselves, so they are safe here.
    crate::presence::apply_surface_visibility(app);
    crate::overlay::apply_surface_visibility(app);
    crate::toast::apply_surface_visibility(app);
}

/// One surface's rectangle out of `j/layers`, in logical px.
fn rect(surface: &serde_json::Value) -> Option<(i64, i64, i64, i64)> {
    let get = |k: &str| surface.get(k).and_then(|v| v.as_i64());
    Some((get("x")?, get("y")?, get("w")?, get("h")?))
}

fn namespace(surface: &serde_json::Value) -> &str {
    surface
        .get("namespace")
        .and_then(|n| n.as_str())
        .unwrap_or("")
}

fn overlaps(a: &serde_json::Value, b: &serde_json::Value) -> bool {
    let (Some((ax, ay, aw, ah)), Some((bx, by, bw, bh))) = (rect(a), rect(b)) else {
        // A surface we cannot measure is treated as overlapping: missing
        // geometry must not be read as "nothing is in the way".
        return true;
    };
    ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah
}

/// Is one of our overlay surfaces buried under a foreign one?
///
/// Layer surfaces on the same layer stack in **map order** — the last to map is
/// on top, and the compositor hands it the click where they overlap. There is
/// no raise request in wlr-layer-shell, so anything that maps while the HUD is
/// up lands above us: a notification, an OSD, a panel from a shell plugin.
/// Measured on Hyprland 0.56.2 with a full-screen overlay surface mapped over
/// the badge: the badge stays visible and still draws, and every click goes to
/// the newcomer instead. That is the whole of the "visible but dead" bug.
///
/// `j/layers` lists each level bottom-to-top, so "above us" is simply "later in
/// the array".
fn covered(layers: &serde_json::Value) -> bool {
    for monitor in layers.as_object().into_iter().flatten().map(|(_, v)| v) {
        let Some(level) = monitor
            .get("levels")
            .and_then(|l| l.get(OVERLAY_LEVEL))
            .and_then(|l| l.as_array())
        else {
            continue;
        };
        for (i, ours) in level.iter().enumerate() {
            if namespace(ours) != OUR_NAMESPACE {
                continue;
            }
            if level[i + 1..]
                .iter()
                .any(|above| namespace(above) != OUR_NAMESPACE && overlaps(ours, above))
            {
                return true;
            }
        }
    }
    false
}

/// How much of the cooldown is left, or `None` when it has elapsed.
fn cooldown_left() -> Option<Duration> {
    let last = LAST_REASSERT.lock().unwrap_or_else(|e| e.into_inner());
    (*last).and_then(|t| REASSERT_COOLDOWN.checked_sub(t.elapsed()))
}

fn mark_reasserted() {
    *LAST_REASSERT.lock().unwrap_or_else(|e| e.into_inner()) = Some(Instant::now());
}

/// Take the top of the overlay layer back.
///
/// Only an unmap/map does it: `zwlr_layer_surface_v1.set_layer` was measured on
/// 0.56.2 and does **not** restack — a surface set back to its own layer stays
/// exactly where it was. So each promoted window is hidden and shown again,
/// which destroys its layer surface and creates a new one at the top of the
/// list. This is the same thing that made the bug look self-healing: the HUD is
/// hidden and re-shown at match end, and clicks came back with it.
///
/// Hidden surfaces are left alone — this is a restack, not a show, and it must
/// never be able to put a surface on screen that something else has deliberately
/// hidden (Arena off screen, the HUD between matches, a disabled badge).
fn reassert(app: &AppHandle) {
    eprintln!("[hypr] another overlay surface is above ours — re-mapping to take the top back");
    crate::overlay::remap_promoted(app);
    crate::presence::remap_promoted(app);
}

/// A foreign surface just mapped on the overlay layer. Re-map ours if it landed
/// on top of one of them. Runs on the watch thread, where blocking is fine.
fn on_foreign_layer(app: &AppHandle) {
    if !managed() || !surfaces_visible() {
        return;
    }
    std::thread::sleep(SETTLE);
    if !buried() {
        return;
    }
    // Rate limited, but never *skipped*. Two surfaces mapping a moment apart
    // would otherwise have the second check thrown away by the cooldown and
    // leave the HUD buried until something else happened to fire an event —
    // which is the original bug wearing a shorter timer. Wait the cooldown out
    // and look again instead; a burst costs one sleep, because the checks after
    // the first re-map find nothing above us and return.
    if let Some(left) = cooldown_left() {
        std::thread::sleep(left);
        if !buried() {
            return;
        }
    }
    mark_reasserted();
    reassert(app);
}

/// Ask the compositor whether anything is stacked over us right now.
/// `false` when it cannot be asked: a re-map is visible, so an unanswered
/// question is not worth one.
fn buried() -> bool {
    request("j/layers")
        .and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok())
        .is_some_and(|layers| covered(&layers))
}

/// Events that can change the answer. Deliberately excludes `windowtitle` and
/// `activewindow`, which fire continuously — a spinner in another window's
/// title should not cost two IPC round trips.
fn is_interesting(event: &str) -> bool {
    matches!(
        event,
        "workspace"
            | "workspacev2"
            | "focusedmon"
            | "focusedmonv2"
            | "activespecial"
            | "activespecialv2"
            | "openwindow"
            | "closewindow"
            | "movewindow"
            | "movewindowv2"
            | "monitoradded"
            | "monitoraddedv2"
            | "monitorremoved"
            | "monitorremovedv2"
            | "fullscreen"
            | "changefloatingmode"
    )
}

/// Watch the compositor for as long as the app runs.
///
/// Reconnects on its own: Hyprland closing the socket (a crash, a session
/// restart) must not leave the surfaces stuck hidden on every workspace.
pub fn start_watch(app: AppHandle) {
    if !managed() {
        return;
    }
    std::thread::spawn(move || {
        eprintln!("[hypr] watching the compositor for Arena's workspace");
        // Answer once up front — Arena may already be running somewhere.
        refresh(&app);
        loop {
            match socket(".socket2.sock").and_then(|p| UnixStream::connect(p).ok()) {
                Some(stream) => watch_once(&app, stream),
                None => std::thread::sleep(Duration::from_secs(5)),
            }
            // Either the socket closed or it was never there. Re-ask on the way
            // back round so a reconnect cannot leave a stale answer behind.
            std::thread::sleep(Duration::from_secs(2));
            refresh(&app);
        }
    });
}

fn watch_once(app: &AppHandle, stream: UnixStream) {
    let mut reader = std::io::BufReader::new(stream);
    let mut line = String::new();
    loop {
        line.clear();
        match std::io::BufRead::read_line(&mut reader, &mut line) {
            Ok(0) | Err(_) => return,
            Ok(_) => {}
        }
        let (name, payload) = line.split_once(">>").unwrap_or((line.as_str(), ""));
        let name = name.trim();
        // A surface mapping on the overlay layer cannot change Arena's
        // workspace, so it does not belong in `is_interesting` — but it can
        // bury the HUD, which is a different problem with a different answer.
        if name == "openlayer" {
            if payload.trim() != OUR_NAMESPACE {
                on_foreign_layer(app);
            }
            continue;
        }
        if !is_interesting(name) {
            continue;
        }
        // Deliberately not debounced. A workspace switch emits a handful of
        // these at once and it is tempting to drop the extras, but dropping
        // the *last* event of a burst leaves the wrong answer latched until
        // something else happens. Two reads on a local socket cost far less
        // than a HUD stuck on the wrong desktop, and `refresh` already returns
        // without touching a window when the answer has not changed.
        refresh(app);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// Shapes copied from `hyprctl -j monitors` / `-j clients` on 0.56.2.
    fn monitors(active: i64, special: i64) -> serde_json::Value {
        json!([{
            "name": "eDP-1",
            "activeWorkspace": { "id": active, "name": active.to_string() },
            "specialWorkspace": { "id": special, "name": "" },
        }])
    }

    fn arena_on(ws: i64) -> serde_json::Value {
        json!({ "class": "steam_app_2141910", "title": "MTGA",
                "workspace": { "id": ws, "name": ws.to_string() } })
    }

    #[test]
    fn a_monitor_shows_its_active_workspace() {
        assert_eq!(on_screen_workspaces(&monitors(3, 0)), vec![3]);
    }

    #[test]
    fn no_special_workspace_is_reported_as_zero_not_as_a_workspace() {
        // Hyprland uses id 0 for "none". Treating it as a real workspace would
        // match any client that somehow reported 0 and pin the HUD on screen.
        let ids = on_screen_workspaces(&monitors(1, 0));
        assert!(!ids.contains(&0), "id 0 must not count as on screen");
    }

    #[test]
    fn a_pulled_up_scratchpad_counts_as_on_screen() {
        // Omarchy's Super+S is where this box keeps Arena, so a special
        // workspace being active is exactly when a scratchpad Arena is visible.
        let ids = on_screen_workspaces(&monitors(1, -98));
        assert!(ids.contains(&-98));
        assert!(ids.contains(&1));
    }

    #[test]
    fn every_monitor_contributes_its_own_workspace() {
        let two = json!([
            { "activeWorkspace": { "id": 1 }, "specialWorkspace": { "id": 0 } },
            { "activeWorkspace": { "id": 7 }, "specialWorkspace": { "id": 0 } },
        ]);
        let ids = on_screen_workspaces(&two);
        assert!(ids.contains(&1) && ids.contains(&7));
    }

    #[test]
    fn arena_is_matched_by_class_or_by_title() {
        assert!(is_arena(&arena_on(2)));
        // Proton reports the title before the class settles during startup.
        assert!(is_arena(&json!({ "class": "", "title": "MTGA" })));
        assert!(!is_arena(
            &json!({ "class": "firefox", "title": "not arena" })
        ));
    }

    /// Shape copied from `hyprctl -j layers` on 0.56.2. The array for a level
    /// is ordered bottom-to-top, which is what `covered` reads.
    fn overlay_level(surfaces: serde_json::Value) -> serde_json::Value {
        json!({ "eDP-1": { "levels": { "0": [], "2": [], "3": surfaces } } })
    }

    fn surface(ns: &str, x: i64, y: i64, w: i64, h: i64) -> serde_json::Value {
        json!({ "namespace": ns, "x": x, "y": y, "w": w, "h": h })
    }

    /// A typical badge rect (first-run bottom-left). Overlap tests care
    /// about stacking, not that the user left it here.
    fn badge() -> serde_json::Value {
        surface(OUR_NAMESPACE, 16, 912, 142, 32)
    }

    #[test]
    fn alone_on_the_layer_is_not_covered() {
        assert!(!covered(&overlay_level(json!([badge()]))));
    }

    #[test]
    fn a_later_overlapping_surface_covers_us() {
        // The whole bug: a full-screen overlay surface that maps after the
        // badge takes every click while the badge stays visible.
        let full = surface("omarchy-notifications", 0, 0, 1536, 960);
        assert!(covered(&overlay_level(json!([badge(), full]))));
    }

    #[test]
    fn a_later_surface_that_misses_us_does_not() {
        // The bar's peek strip lives on the overlay layer too, 6px below the
        // badge. Re-mapping for that would blink the HUD for nothing.
        let peek = surface("omarchy-bar-peek", 0, 950, 1536, 10);
        assert!(!covered(&overlay_level(json!([badge(), peek]))));
    }

    #[test]
    fn a_surface_mapped_before_us_is_below_us() {
        // Same rectangle, but earlier in the array means it mapped first and
        // sits underneath — it cannot take our clicks.
        let full = surface("click-thief", 0, 0, 1536, 960);
        assert!(!covered(&overlay_level(json!([full, badge()]))));
    }

    #[test]
    fn our_own_surfaces_never_count_as_covering_each_other() {
        // The cog menu sits above the badge by design.
        let menu = surface(OUR_NAMESPACE, 16, 649, 246, 255);
        assert!(!covered(&overlay_level(json!([badge(), menu]))));
    }

    #[test]
    fn a_surface_between_two_of_ours_still_covers_the_lower_one() {
        let thief = surface("click-thief", 0, 0, 1536, 960);
        let hud = surface(OUR_NAMESPACE, 0, 51, 394, 34);
        assert!(covered(&overlay_level(json!([badge(), thief, hud]))));
    }

    #[test]
    fn unmeasurable_geometry_is_treated_as_in_the_way() {
        // Better a wasted re-map than a buried HUD: a reply we cannot read
        // must not be taken as proof that nothing is above us.
        let odd = json!({ "namespace": "mystery" });
        assert!(covered(&overlay_level(json!([badge(), odd]))));
    }

    #[test]
    fn a_malformed_layers_reply_is_not_covered_and_does_not_panic() {
        assert!(!covered(&json!({})));
        assert!(!covered(&json!({ "eDP-1": {} })));
        assert!(!covered(
            &json!({ "eDP-1": { "levels": { "3": "nonsense" } } })
        ));
        assert!(!covered(&json!([])));
    }

    #[test]
    fn missing_fields_are_not_arena() {
        // A malformed reply must read as "not on screen", never panic.
        assert!(!is_arena(&json!({})));
        assert!(on_screen_workspaces(&json!({})).is_empty());
        assert!(on_screen_workspaces(&json!([{}])).is_empty());
    }
}
