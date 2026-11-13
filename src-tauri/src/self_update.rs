//! Who installs this copy's updates, and (Linux) the restart after one.
//!
//! Windows and macOS always update in-app through the signed updater. Linux
//! has two kinds of install, and they need opposite answers:
//!
//! * **A copy in a folder the user owns** (`install.sh` puts it in
//!   `~/.local/share/filthy-net-deck/`). The signed updater can replace the
//!   binary in place — no password, the same "Update & restart" as Windows.
//!   The updater's Linux path for anything that is not a deb/rpm writes the
//!   downloaded, signature-checked file over the running executable, which is
//!   exactly this.
//! * **A copy a package manager owns** (`/usr/bin`, from the pacman recipe).
//!   Root owns the file, so the updater's rename fails; and if it did not,
//!   pacman's database would then describe a file that is no longer there.
//!   Settings keeps naming the package route for these.
//!
//! Self-install copies look up their own updater platform key,
//! `linux-x86_64-local`, never the plain `linux-x86_64`. Builds up to 3.9.14
//! are all `/usr/bin` pacman copies and look up only the plain key, so
//! publishing self-updates cannot make one of them try — and fail — to
//! overwrite a root-owned file.

use serde::Serialize;
#[cfg(target_os = "linux")]
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateRoute {
    /// `"self"`: the signed updater installs over this copy.
    /// `"package"`: a package manager owns it; the app only reports.
    pub kind: &'static str,
    /// Updater platform key to look up instead of the default (Linux
    /// self-install only), passed to `check({ target })`.
    pub target: Option<String>,
}

/// Directories only a package manager writes to. A binary under one of these
/// is never ours to replace, even when the directory happens to be writable
/// (a root shell, a container).
#[cfg(any(target_os = "linux", test))]
const PACKAGE_PREFIXES: &[&str] = &[
    "/usr/", "/opt/", "/bin/", "/sbin/", "/lib/", "/nix/", "/snap/", "/app/",
];

/// Pure decision, so the rule is testable without a filesystem.
#[cfg(any(target_os = "linux", test))]
fn linux_route(exe: &str, parent_writable: bool, arch: &str) -> UpdateRoute {
    let managed = PACKAGE_PREFIXES.iter().any(|p| exe.starts_with(p));
    if managed || !parent_writable {
        return UpdateRoute {
            kind: "package",
            target: None,
        };
    }
    UpdateRoute {
        kind: "self",
        target: Some(format!("linux-{arch}-local")),
    }
}

/// The updater renames the running binary aside and writes the new one in
/// its place, so what has to be writable is the *directory*. Opening the
/// executable itself for writing would fail anyway (ETXTBSY while it runs).
#[cfg(target_os = "linux")]
fn dir_writable(dir: &Path) -> bool {
    let probe = dir.join(format!(".fnd-write-test-{}", std::process::id()));
    match std::fs::File::create(&probe) {
        Ok(_) => {
            let _ = std::fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

#[tauri::command]
pub fn update_route() -> UpdateRoute {
    #[cfg(target_os = "linux")]
    {
        // The path Tauri cached at startup, symlinks resolved — the same one
        // the updater writes to and the restart runs.
        let Ok(exe) = tauri::utils::platform::current_exe() else {
            return UpdateRoute {
                kind: "package",
                target: None,
            };
        };
        let writable = exe.parent().is_some_and(dir_writable);
        linux_route(&exe.to_string_lossy(), writable, std::env::consts::ARCH)
    }
    #[cfg(not(target_os = "linux"))]
    {
        UpdateRoute {
            kind: "self",
            target: None,
        }
    }
}

/// Waits for the old process to be gone, then starts the new binary. Without
/// the wait the new copy starts while the old one still holds the
/// single-instance name, hands its launch to the dying process, and exits —
/// leaving nothing running. Capped at 30 s so a hung exit cannot leave the
/// user with no app at all.
#[cfg(target_os = "linux")]
const WAIT_THEN_START: &str = r#"i=0
while kill -0 "$1" 2>/dev/null && [ "$i" -lt 300 ]; do i=$((i+1)); sleep 0.1; done
exec "$2""#;

/// Environment a fresh unit must not inherit: these describe the *old*
/// process's systemd unit and journal stream, and would mislabel the new one.
#[cfg(target_os = "linux")]
const UNIT_SPECIFIC_ENV: &[&str] = &[
    "INVOCATION_ID",
    "JOURNAL_STREAM",
    "SYSTEMD_EXEC_PID",
    "MANAGERPID",
    "NOTIFY_SOCKET",
    "LISTEN_PID",
    "LISTEN_FDS",
    "LISTEN_FDNAMES",
];

/// Start the updated binary once this process has exited.
///
/// Why not `tauri-plugin-process`'s `relaunch()`: it spawns the new copy as a
/// child and exits. Autostart on a systemd desktop (Omarchy/uwsm among them)
/// runs FND as a user *service*, and when a service's main process exits
/// systemd stops the unit and kills everything left in its cgroup — the
/// freshly started copy included. Measured on the maintainer's box: a plain
/// child died with its service; one started through `systemd-run --user`
/// lived on. It also passes `--hidden` back in, so an update clicked from the
/// open window would restart into the tray.
///
/// So the new copy starts in its own transient user unit, with no arguments
/// (the user is looking at the window), and the environment passed across
/// explicitly — the user manager's environment is not guaranteed to carry the
/// Wayland/X11 session variables. Without systemd, a detached process group.
#[cfg(target_os = "linux")]
pub fn spawn_relauncher() -> Result<(), String> {
    use std::os::unix::process::CommandExt;
    use std::process::{Command, Stdio};

    let bin = tauri::utils::platform::current_exe().map_err(|e| e.to_string())?;
    let pid = std::process::id().to_string();

    let mut unit = Command::new("systemd-run");
    unit.args([
        "--user",
        "--quiet",
        "--collect",
        "--description=Filthy Net Deck (restarted after an update)",
    ]);
    for (key, value) in std::env::vars_os() {
        let Some(key) = key.to_str() else { continue };
        if UNIT_SPECIFIC_ENV.contains(&key) {
            continue;
        }
        let mut pair = std::ffi::OsString::from(format!("--setenv={key}="));
        pair.push(&value);
        unit.arg(pair);
    }
    unit.args(["--", "/bin/sh", "-c", WAIT_THEN_START, "fnd-relaunch", &pid])
        .arg(&bin)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    // `systemd-run` (service mode) returns as soon as the unit has started,
    // so its status says whether the hand-off happened.
    if matches!(unit.status(), Ok(s) if s.success()) {
        return Ok(());
    }

    Command::new("/bin/sh")
        .args(["-c", WAIT_THEN_START, "fnd-relaunch", &pid])
        .arg(&bin)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .process_group(0)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("could not start the updated app: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn package_manager_paths_never_self_update() {
        for exe in [
            "/usr/bin/filthy-net-deck",
            "/opt/filthy-net-deck/filthy-net-deck",
            "/nix/store/abc-filthy-net-deck/bin/filthy-net-deck",
            "/app/bin/filthy-net-deck",
        ] {
            // Writable or not: a root shell can write /usr, and it is still
            // pacman's file.
            assert_eq!(linux_route(exe, true, "x86_64").kind, "package", "{exe}");
            assert_eq!(linux_route(exe, true, "x86_64").target, None);
        }
    }

    #[test]
    fn a_copy_in_a_folder_the_user_owns_updates_itself() {
        let r = linux_route(
            "/home/u/.local/share/filthy-net-deck/filthy-net-deck",
            true,
            "x86_64",
        );
        assert_eq!(r.kind, "self");
        // Never the plain key: 3.9.14 and older pacman copies look that one up.
        assert_eq!(r.target.as_deref(), Some("linux-x86_64-local"));
    }

    #[test]
    fn an_unwritable_folder_falls_back_to_reporting() {
        let r = linux_route("/home/u/apps/filthy-net-deck", false, "x86_64");
        assert_eq!(r.kind, "package");
        assert_eq!(r.target, None);
    }

    #[test]
    fn prefix_match_is_on_whole_directories() {
        // "/usrlocal" is not "/usr/".
        assert_eq!(linux_route("/usrlocal/fnd", true, "x86_64").kind, "self");
    }
}
