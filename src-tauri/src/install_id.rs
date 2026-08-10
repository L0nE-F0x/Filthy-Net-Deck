//! Random per-install identifier for the opt-in health ping.
//!
//! Lives in the app data dir (next to `presence-enabled`) rather than
//! `localStorage`, so it survives a WebView storage clear and is the same value
//! across all four webviews.
//!
//! It is **pseudonymous, not anonymous**: it makes "this install has been active
//! N days" knowable, which is the entire point — it is the only way to count
//! unique installs at all (see `docs/BACKEND-PHASE-2.md` §7.1). It is created
//! only when the user opts in, and `clear` deletes it so opting out is a real
//! reset rather than a paused upload.

use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const FILE: &str = "install-id";

fn path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join(FILE))
}

/// A v4-shaped UUID from the OS RNG. Avoids pulling in the `uuid` crate for one
/// call site; `getrandom` is already in the tree via `rand`/`tauri`.
fn new_id() -> String {
    let mut b = [0u8; 16];
    getrandom::fill(&mut b).expect("OS RNG unavailable");
    // Version 4, RFC 4122 variant.
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    let h: Vec<String> = b.iter().map(|x| format!("{x:02x}")).collect();
    let h = h.join("");
    format!(
        "{}-{}-{}-{}-{}",
        &h[0..8],
        &h[8..12],
        &h[12..16],
        &h[16..20],
        &h[20..32]
    )
}

fn is_wellformed(s: &str) -> bool {
    s.len() == 36 && s.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
}

/// Read the existing id without creating one. `None` when the user has never
/// opted in (or has opted out).
#[tauri::command]
pub fn install_id_get(app: AppHandle) -> Option<String> {
    let raw = path(&app).and_then(|p| fs::read_to_string(p).ok())?;
    let id = raw.trim().to_string();
    is_wellformed(&id).then_some(id)
}

/// Read the id, creating one if absent. Call this only on opt-in.
#[tauri::command]
pub fn install_id_ensure(app: AppHandle) -> Result<String, String> {
    if let Some(existing) = install_id_get(app.clone()) {
        return Ok(existing);
    }
    let path = path(&app).ok_or_else(|| "no app data dir".to_string())?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let id = new_id();
    fs::write(&path, id.as_bytes()).map_err(|e| e.to_string())?;
    Ok(id)
}

/// Delete the id. Opting out must not leave a dormant identifier on disk.
#[tauri::command]
pub fn install_id_clear(app: AppHandle) -> Result<(), String> {
    let Some(path) = path(&app) else {
        return Ok(());
    };
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::{is_wellformed, new_id};

    #[test]
    fn generates_wellformed_v4_uuids() {
        let id = new_id();
        assert!(is_wellformed(&id), "not wellformed: {id}");
        assert_eq!(id.as_bytes()[14] as char, '4', "version nibble");
        let variant = id.as_bytes()[19] as char;
        assert!(
            matches!(variant, '8' | '9' | 'a' | 'b'),
            "variant nibble: {variant}"
        );
    }

    #[test]
    fn ids_are_distinct() {
        let a = new_id();
        let b = new_id();
        assert_ne!(a, b);
    }

    #[test]
    fn rejects_malformed_ids() {
        assert!(!is_wellformed(""));
        assert!(!is_wellformed("not-a-uuid"));
        assert!(!is_wellformed(&"z".repeat(36)));
    }
}
