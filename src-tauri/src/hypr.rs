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
use std::time::Duration;
use tauri::AppHandle;

/// Arena's window class under Proton. Must match the packaged Hyprland config.
const ARENA_CLASS: &str = "steam_app_2141910";
/// Arena's title before Proton reports a class, seen during startup.
const ARENA_TITLE: &str = "MTGA";

/// Is Arena on a workspace that is currently on screen? Starts `true` so that
/// nothing is hidden before the first answer arrives, and stays `true` forever
/// on setups this module does not manage.
static ARENA_ON_SCREEN: AtomicBool = AtomicBool::new(true);
/// Set while the compositor cannot be reached, so the warning is logged once
/// per outage rather than once per retry.
static ASK_FAILED: AtomicBool = AtomicBool::new(false);

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
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        crate::presence::apply_surface_visibility(&handle);
        crate::overlay::apply_surface_visibility(&handle);
        crate::toast::apply_surface_visibility(&handle);
    });
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
        let name = line.split_once(">>").map(|(n, _)| n).unwrap_or("").trim();
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

    #[test]
    fn missing_fields_are_not_arena() {
        // A malformed reply must read as "not on screen", never panic.
        assert!(!is_arena(&json!({})));
        assert!(on_screen_workspaces(&json!({})).is_empty());
        assert!(on_screen_workspaces(&json!([{}])).is_empty());
    }
}
