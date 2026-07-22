//! "Is MTG Arena running?" — the signal the corner presence badge rides on.
//!
//! The tracker only knows about *matches* (`LiveMatch.phase`), so nothing knew
//! Arena was merely open at the home screen or in the deck builder. This polls
//! the process list for Arena itself, which is true from launch to quit.
//!
//! Privacy: this only ever asks "is a process named MTGA running" — no other
//! process is inspected, recorded or sent anywhere.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use sysinfo::{ProcessRefreshKind, RefreshKind, System};
use tauri::{AppHandle, Emitter};

/// Arena's executable stem on both shipping platforms (`MTGA.exe` on Windows,
/// `MTGA` on macOS). Matched case-insensitively.
const ARENA_STEM: &str = "mtga";
/// Slow enough to be free, fast enough that the badge feels attached to Arena.
const POLL: Duration = Duration::from_secs(4);

static RUNNING: AtomicBool = AtomicBool::new(false);

pub fn is_running() -> bool {
    RUNNING.load(Ordering::SeqCst)
}

/// Is this process name Arena's? Windows reports `MTGA.exe`, macOS `MTGA`.
/// Deliberately exact on the stem — `MTGAHelper.exe` and friends are other
/// people's trackers, not the game.
fn is_arena_process(name: &str) -> bool {
    let stem = name.rsplit_once('.').map(|(head, _)| head).unwrap_or(name);
    stem.eq_ignore_ascii_case(ARENA_STEM)
}

/// Pure transition helper for the poll loop: emit only when running-ness flips.
/// `previous` is the value *before* this scan; `current` is the fresh scan.
/// Returns `Some(current)` on an edge (start or stop), else `None`.
fn running_transition(previous: bool, current: bool) -> Option<bool> {
    if previous != current {
        Some(current)
    } else {
        None
    }
}

/// True when any live process' executable name is Arena's.
fn scan(sys: &mut System) -> bool {
    sys.refresh_specifics(RefreshKind::nothing().with_processes(ProcessRefreshKind::nothing()));
    sys.processes()
        .values()
        .any(|p| is_arena_process(&p.name().to_string_lossy()))
}

/// Poll in the background, publishing every transition to the whole app.
pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        let mut sys = System::new();
        loop {
            let now = scan(&mut sys);
            // `swap` so only a real transition emits — this runs forever.
            let previous = RUNNING.swap(now, Ordering::SeqCst);
            if let Some(running) = running_transition(previous, now) {
                let _ = app.emit("arena:running", running);
                if running {
                    crate::presence::show(&app);
                } else {
                    crate::presence::hide(&app);
                }
            }
            std::thread::sleep(POLL);
        }
    });
}

#[tauri::command]
pub fn arena_is_running() -> bool {
    is_running()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_arena_on_both_platforms() {
        assert!(is_arena_process("MTGA.exe")); // Windows
        assert!(is_arena_process("MTGA")); // macOS
        assert!(is_arena_process("mtga.exe")); // case-insensitive
        assert!(is_arena_process("Mtga")); // mixed case stem, no extension
    }

    #[test]
    fn ignores_other_trackers_and_lookalikes() {
        assert!(!is_arena_process("MTGAHelper.exe"));
        assert!(!is_arena_process("MTGArena.exe"));
        assert!(!is_arena_process("Untapped.exe"));
        assert!(!is_arena_process("filthy-net-deck.exe"));
        assert!(!is_arena_process(""));
        // Prefix / suffix cousins must not match the exact stem.
        assert!(!is_arena_process("MTGAOverlay.exe"));
        assert!(!is_arena_process("xMTGA.exe"));
        assert!(!is_arena_process("MTGA2.exe"));
        // Double-extension leftover should not collapse to MTGA.
        assert!(!is_arena_process("MTGA.exe.bak"));
        // Whitespace-only and unrelated games.
        assert!(!is_arena_process("   "));
        assert!(!is_arena_process("LeagueClient.exe"));
    }

    #[test]
    fn running_transition_emits_only_on_edges() {
        // Steady states: no emit (debounce / edge-only).
        assert_eq!(running_transition(false, false), None);
        assert_eq!(running_transition(true, true), None);
        // Rising edge: Arena launched.
        assert_eq!(running_transition(false, true), Some(true));
        // Falling edge: Arena quit.
        assert_eq!(running_transition(true, false), Some(false));
    }

    #[test]
    fn running_transition_sequence_is_stable() {
        // Simulate a few poll ticks with no live process / AppHandle.
        let mut state = false;
        let mut emits: Vec<bool> = Vec::new();
        for scan_now in [false, false, true, true, true, false, false] {
            if let Some(v) = running_transition(state, scan_now) {
                emits.push(v);
            }
            state = scan_now;
        }
        assert_eq!(emits, vec![true, false]);
    }

    /// Sanity-checks the live process scan against this machine. Ignored by
    /// default — only meaningful with Arena actually open.
    #[test]
    #[ignore]
    fn scan_sees_a_running_arena() {
        let mut sys = System::new();
        assert!(scan(&mut sys), "expected MTGA to be running");
    }
}
