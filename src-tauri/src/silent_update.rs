//! In-app Windows update without opening a browser.
//!
//! Preferred path is the signed Tauri updater plugin. This module is the
//! desktop fallback: download the official NSIS installer to a temp file,
//! run it silently, then relaunch the app.

use std::process::Command;
use tauri::{AppHandle, Emitter};

/// Official installer hosts (primary custom domain + legacy Netlify subdomain).
const ALLOWED_HOST_PREFIXES: &[&str] = &[
    "https://filthy-net-deck.com/",
    "https://www.filthy-net-deck.com/",
    "https://filthy-net-deck.netlify.app/",
];

fn is_allowed_update_url(url: &str) -> bool {
    ALLOWED_HOST_PREFIXES.iter().any(|p| url.starts_with(p))
}

#[tauri::command]
pub async fn install_update_silent(app: AppHandle, url: String) -> Result<(), String> {
    if !is_allowed_update_url(&url) {
        return Err("Update URL must be from filthy-net-deck.com (or legacy Netlify host).".into());
    }
    let lower = url.to_ascii_lowercase();
    if !lower.ends_with(".exe") {
        return Err("Update URL must be a Windows .exe installer.".into());
    }

    let _ = app.emit("updater:progress", 5i32);

    let client = reqwest::Client::builder()
        .user_agent(concat!("FilthyNetDeck/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Download failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("Download failed (HTTP {}).", response.status()));
    }

    let _ = app.emit("updater:progress", 25i32);
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Download failed: {e}"))?;
    let _ = app.emit("updater:progress", 70i32);

    let path = std::env::temp_dir().join(format!(
        "Filthy-Net-Deck-Setup-update-{}.exe",
        std::process::id()
    ));
    std::fs::write(&path, &bytes).map_err(|e| format!("Could not write installer: {e}"))?;
    let _ = app.emit("updater:progress", 90i32);

    #[cfg(windows)]
    {
        let installer = path.display().to_string();
        let relaunch = std::env::current_exe()
            .map(|p| p.display().to_string())
            .unwrap_or_default();

        // Close this process first so NSIS can replace files: delay, silent install, relaunch.
        let script = if relaunch.is_empty() {
            format!("ping -n 2 127.0.0.1 >nul & \"{installer}\" /S")
        } else {
            format!("ping -n 2 127.0.0.1 >nul & \"{installer}\" /S & start \"\" \"{relaunch}\"")
        };

        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        Command::new("cmd")
            .args(["/C", &script])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("Could not start installer: {e}"))?;

        let _ = app.emit("updater:progress", 100i32);
        app.exit(0);
        Ok(())
    }

    #[cfg(not(windows))]
    {
        let _ = path;
        Err("Silent installer updates are only supported on Windows.".into())
    }
}
