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
            if RUNNING.swap(now, Ordering::SeqCst) != now {
                let _ = app.emit("arena:running", now);
                if now {
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
    }

    #[test]
    fn ignores_other_trackers_and_lookalikes() {
        assert!(!is_arena_process("MTGAHelper.exe"));
        assert!(!is_arena_process("MTGArena.exe"));
        assert!(!is_arena_process("Untapped.exe"));
        assert!(!is_arena_process("filthy-net-deck.exe"));
        assert!(!is_arena_process(""));
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
