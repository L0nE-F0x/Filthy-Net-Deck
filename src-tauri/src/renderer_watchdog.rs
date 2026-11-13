//! Linux: stop a runaway `WebKitWebProcess` from taking the whole machine down.
//!
//! On 2026-11-13 the main window's renderer ran away four times on the
//! owner's machine (WebKitGTK 2.54.1, Hyprland, Intel iGPU, 0.9091 text
//! scaling): 25 GB (froze the desktop), 21.8 GB, 10.7 GB and 4.7 GB. Each time
//! within seconds of reopening the main window from the tray in fullscreen,
//! after it had sat hidden for 15–40 minutes. The compositor thread
//! (`ThreadedCompositor`) ran at 100% allocating ~280 MB/s while the page's
//! main thread waited on it in `WorkQueue::dispatchSync`. Every reopen on
//! Wayland maps the window fresh and resizes it five or six times (own size,
//! tiled, fullscreen), but 40 quick reopens in a sandbox never reproduced it,
//! and libwebkit2gtk is stripped with no debuginfod entry. So this does not
//! fix the cause. It bounds the damage, whatever the cause, and leaves
//! evidence for next time:
//!
//! * every renderer FND owns is measured (RSS + swap) every [`CHECK_EVERY`];
//! * each new whole gigabyte past the first is logged, so the journal says
//!   when growth began and how fast it went;
//! * a renderer over the limit on [`STRIKES`] checks in a row has its threads
//!   logged and is killed. The main window reloads itself
//!   ([`reload_main_on_renderer_exit`]); the other windows are rebuilt on
//!   demand anyway.
//!
//! This runs on its own thread in the app process, not in the renderer.
//! WebKit's built-in memory limit (`WebKitMemoryPressureSettings`) is measured
//! on the renderer's own main thread, which is exactly the thread that was
//! stuck when this was found.

use std::collections::HashMap;
use std::fs;
use std::time::Duration;

/// Short, because the runaway is fast: the second one on 2026-11-13 grew
/// ~280 MB/s, and at the 15 s this started with it reached 10.7 GB before it
/// was killed. Reading two small `/proc` files per renderer is nothing.
const CHECK_EVERY: Duration = Duration::from_secs(3);
/// Renderers normally sit at 200–700 MB. Several times that is not a heavy page.
const DEFAULT_LIMIT_MB: u64 = 4096;
/// Consecutive over-limit checks before acting, so a brief spike is left alone.
const STRIKES: u32 = 2;
/// Over the limit *and* this much bigger than one check ago is a runaway, not
/// a spike: kill at once instead of waiting for the second strike. (170 MB/s
/// sustained; no page FND shows grows like that.)
const RUNAWAY_MB_PER_CHECK: u64 = 512;
/// `comm` is truncated to 15 bytes by the kernel.
const RENDERER_COMM: &str = "WebKitWebProces";

/// `FND_RENDERER_LIMIT_MB` overrides the limit, for testing the kill path.
fn limit_mb() -> u64 {
    std::env::var("FND_RENDERER_LIMIT_MB")
        .ok()
        .and_then(|v| v.parse().ok())
        .filter(|&mb| mb > 0)
        .unwrap_or(DEFAULT_LIMIT_MB)
}

pub fn start() {
    let limit = limit_mb();
    let me = std::process::id();
    std::thread::Builder::new()
        .name("renderer-watchdog".into())
        .spawn(move || {
            let mut state = Watch::default();
            loop {
                std::thread::sleep(CHECK_EVERY);
                let seen: Vec<(u32, u64)> = child_renderers(me)
                    .into_iter()
                    .filter_map(|pid| renderer_mb(pid).map(|mb| (pid, mb)))
                    .collect();
                for action in state.observe(&seen, limit) {
                    match action {
                        Action::Milestone { pid, gb } => eprintln!(
                            "[renderer-watchdog] renderer {pid} passed {gb} GB (limit {limit} MB)"
                        ),
                        Action::Kill { pid, mb, grew_mb } => {
                            eprintln!(
                                "[renderer-watchdog] renderer {pid} at {mb} MB (limit {limit} MB, \
                                 +{grew_mb} MB in {}s) — killing it. {}",
                                CHECK_EVERY.as_secs(),
                                describe(pid)
                            );
                            kill(pid);
                        }
                    }
                }
            }
        })
        .expect("spawn renderer-watchdog");
}

#[derive(Debug, PartialEq)]
enum Action {
    Milestone { pid: u32, gb: u64 },
    Kill { pid: u32, mb: u64, grew_mb: u64 },
}

/// The decision logic, kept free of `/proc` so it can be tested.
#[derive(Default)]
struct Watch {
    /// Highest whole GB already logged, per pid.
    logged_gb: HashMap<u32, u64>,
    strikes: HashMap<u32, u32>,
    /// Size at the previous check, per pid.
    last_mb: HashMap<u32, u64>,
}

impl Watch {
    fn observe(&mut self, seen: &[(u32, u64)], limit_mb: u64) -> Vec<Action> {
        // Forget pids that have gone, so a reused pid starts clean.
        let alive = |pid: &u32| seen.iter().any(|(p, _)| p == pid);
        self.logged_gb.retain(|pid, _| alive(pid));
        self.strikes.retain(|pid, _| alive(pid));
        self.last_mb.retain(|pid, _| alive(pid));

        let mut out = Vec::new();
        for &(pid, mb) in seen {
            let grew_mb = mb.saturating_sub(self.last_mb.insert(pid, mb).unwrap_or(mb));
            let gb = mb / 1024;
            let logged = self.logged_gb.entry(pid).or_insert(0);
            if gb > *logged {
                *logged = gb;
                out.push(Action::Milestone { pid, gb });
            }
            if mb > limit_mb {
                let s = self.strikes.entry(pid).or_insert(0);
                *s += 1;
                if *s >= STRIKES || grew_mb >= RUNAWAY_MB_PER_CHECK {
                    self.strikes.remove(&pid);
                    out.push(Action::Kill { pid, mb, grew_mb });
                }
            } else {
                self.strikes.remove(&pid);
            }
        }
        out
    }
}

/// `(comm, ppid)` from a `/proc/<pid>/stat` line. `comm` can hold spaces and
/// parentheses, so split on the *last* `)`.
fn parse_stat(stat: &str) -> Option<(&str, u32)> {
    let open = stat.find('(')?;
    let close = stat.rfind(')')?;
    let comm = stat.get(open + 1..close)?;
    let mut rest = stat.get(close + 1..)?.split_whitespace();
    let _state = rest.next()?;
    let ppid = rest.next()?.parse().ok()?;
    Some((comm, ppid))
}

/// Resident + swapped-out memory in MB, from `/proc/<pid>/status`. Swap
/// counts: on 2026-11-13 a quarter of the runaway renderer had been pushed
/// there, and the machine still ground to a halt.
fn parse_status_mb(status: &str) -> Option<u64> {
    let mut kb = None;
    for line in status.lines() {
        if let Some(v) = line
            .strip_prefix("VmRSS:")
            .or_else(|| line.strip_prefix("VmSwap:"))
        {
            let n: u64 = v.split_whitespace().next()?.parse().ok()?;
            kb = Some(kb.unwrap_or(0) + n);
        }
    }
    kb.map(|k| k / 1024)
}

fn child_renderers(me: u32) -> Vec<u32> {
    let Ok(dir) = fs::read_dir("/proc") else {
        return Vec::new();
    };
    dir.flatten()
        .filter_map(|e| e.file_name().to_str()?.parse::<u32>().ok())
        .filter(|pid| {
            fs::read_to_string(format!("/proc/{pid}/stat"))
                .ok()
                .and_then(|s| {
                    parse_stat(&s).map(|(comm, ppid)| comm == RENDERER_COMM && ppid == me)
                })
                .unwrap_or(false)
        })
        .collect()
}

fn renderer_mb(pid: u32) -> Option<u64> {
    parse_status_mb(&fs::read_to_string(format!("/proc/{pid}/status")).ok()?)
}

/// The evidence the 2026-11-13 investigation had to collect by hand: which
/// threads were burning CPU and what each was waiting on.
fn describe(pid: u32) -> String {
    let mut threads: Vec<(u64, String)> = Vec::new();
    if let Ok(dir) = fs::read_dir(format!("/proc/{pid}/task")) {
        for t in dir.flatten() {
            let p = t.path();
            let Ok(stat) = fs::read_to_string(p.join("stat")) else {
                continue;
            };
            let Some(close) = stat.rfind(')') else {
                continue;
            };
            let name = stat
                .get(stat.find('(').map_or(0, |i| i + 1)..close)
                .unwrap_or("?");
            let f: Vec<&str> = stat[close + 1..].split_whitespace().collect();
            // After `comm`: state is field 0, utime 11, stime 12.
            let ticks = f.get(11).and_then(|v| v.parse::<u64>().ok()).unwrap_or(0)
                + f.get(12).and_then(|v| v.parse::<u64>().ok()).unwrap_or(0);
            let state = f.first().copied().unwrap_or("?");
            let wchan = fs::read_to_string(p.join("wchan")).unwrap_or_default();
            threads.push((ticks, format!("{name}[{state} {ticks}t {wchan}]")));
        }
    }
    threads.sort_by_key(|t| std::cmp::Reverse(t.0));
    let top: Vec<String> = threads.into_iter().take(10).map(|(_, s)| s).collect();
    format!("busiest threads: {}", top.join(", "))
}

fn kill(pid: u32) {
    use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, Signal, System};
    let pid = Pid::from_u32(pid);
    let mut sys = System::new();
    sys.refresh_processes_specifics(
        ProcessesToUpdate::Some(&[pid]),
        true,
        ProcessRefreshKind::nothing(),
    );
    // SIGKILL, not SIGTERM: the renderer that prompted this had a wedged main
    // thread, and SIGKILL leaves no 25 GB core dump behind.
    match sys.process(pid).and_then(|p| p.kill_with(Signal::Kill)) {
        Some(true) => {}
        other => eprintln!("[renderer-watchdog] kill {pid} failed: {other:?}"),
    }
}

/// Reload the main window when its renderer dies, from the watchdog or from
/// anything else (the kernel's OOM killer, a WebKit crash). Without this the
/// window is left blank until FND is restarted.
///
/// Never touches the secondary windows: `drop_secondary_webview` ends their
/// renderers on purpose and must not see them come back.
pub fn reload_main_on_renderer_exit(win: &tauri::WebviewWindow) {
    let _ = win.with_webview(|wv| {
        use std::cell::Cell;
        use std::time::Instant;
        use webkit2gtk::{WebProcessTerminationReason, WebViewExt};
        let last_reload: Cell<Option<Instant>> = Cell::new(None);
        wv.inner()
            .connect_web_process_terminated(move |view, reason| {
                // FND never ends the main renderer itself; if something does
                // through the API, it means it.
                if reason == WebProcessTerminationReason::TerminatedByApi {
                    return;
                }
                // A page that dies as soon as it loads would otherwise reload in
                // a tight loop. Leaks take minutes to rebuild, so this never
                // blocks the case the watchdog is for.
                if last_reload
                    .get()
                    .is_some_and(|t| t.elapsed() < Duration::from_secs(60))
                {
                    eprintln!(
                        "[renderer-watchdog] main window's renderer ended again within a minute \
                     ({reason:?}); not reloading — reopen FND"
                    );
                    return;
                }
                eprintln!(
                    "[renderer-watchdog] main window's renderer ended ({reason:?}); reloading"
                );
                last_reload.set(Some(Instant::now()));
                view.reload();
            });
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stat_with_awkward_comm() {
        let s = "2535 (WebKitWebProces) S 1834 2535 1834 0 -1 4194560";
        assert_eq!(parse_stat(s), Some(("WebKitWebProces", 1834)));
        let s = "77 (a) b (c)) R 12 77";
        assert_eq!(parse_stat(s), Some(("a) b (c)", 12)));
        assert_eq!(parse_stat("garbage"), None);
    }

    #[test]
    fn status_counts_rss_and_swap() {
        let s = "Name:\tWebKitWebProces\nVmRSS:\t18891056 kB\nVmSwap:\t 5909504 kB\n";
        assert_eq!(parse_status_mb(s), Some((18891056 + 5909504) / 1024));
        assert_eq!(parse_status_mb("VmRSS:\t2048 kB\n"), Some(2));
        // Kernel threads have neither line.
        assert_eq!(parse_status_mb("Name:\tkthreadd\n"), None);
    }

    #[test]
    fn slow_growth_needs_consecutive_strikes() {
        let mut w = Watch::default();
        assert_eq!(
            w.observe(&[(9, 3900)], 4096),
            vec![Action::Milestone { pid: 9, gb: 3 }]
        );
        // Over once, then back under: the strike resets.
        assert_eq!(
            w.observe(&[(9, 4200)], 4096),
            vec![Action::Milestone { pid: 9, gb: 4 }]
        );
        assert_eq!(w.observe(&[(9, 4000)], 4096), vec![]);
        assert_eq!(w.observe(&[(9, 4300)], 4096), vec![]);
        assert_eq!(
            w.observe(&[(9, 4400)], 4096),
            vec![Action::Kill {
                pid: 9,
                mb: 4400,
                grew_mb: 100
            }]
        );
    }

    #[test]
    fn a_runaway_over_the_limit_is_killed_at_once() {
        let mut w = Watch::default();
        w.observe(&[(4, 3800)], 4096);
        // The 2026-11-13 shape: hundreds of MB per check, straight through.
        assert_eq!(
            w.observe(&[(4, 4700)], 4096),
            vec![
                Action::Milestone { pid: 4, gb: 4 },
                Action::Kill {
                    pid: 4,
                    mb: 4700,
                    grew_mb: 900
                }
            ]
        );
    }

    #[test]
    fn fast_growth_under_the_limit_is_left_alone() {
        let mut w = Watch::default();
        w.observe(&[(6, 300)], 4096);
        // A heavy page loading: big jump, but nowhere near the limit.
        assert_eq!(
            w.observe(&[(6, 2100)], 4096),
            vec![Action::Milestone { pid: 6, gb: 2 }]
        );
    }

    #[test]
    fn logs_each_new_gigabyte_once() {
        let mut w = Watch::default();
        let lim = u64::MAX;
        assert_eq!(w.observe(&[(5, 900)], lim), vec![]);
        assert_eq!(
            w.observe(&[(5, 1100)], lim),
            vec![Action::Milestone { pid: 5, gb: 1 }]
        );
        assert_eq!(w.observe(&[(5, 1500)], lim), vec![]);
        // A jump past two gigabytes at once logs the highest.
        assert_eq!(
            w.observe(&[(5, 3300)], lim),
            vec![Action::Milestone { pid: 5, gb: 3 }]
        );
    }

    #[test]
    fn a_gone_pid_is_forgotten() {
        let mut w = Watch::default();
        w.observe(&[(7, 2100)], 2000);
        // pid 7 exits; a new process later reuses the number.
        w.observe(&[], 2000);
        assert_eq!(
            w.observe(&[(7, 2100)], 2000),
            vec![Action::Milestone { pid: 7, gb: 2 }]
        );
    }
}
