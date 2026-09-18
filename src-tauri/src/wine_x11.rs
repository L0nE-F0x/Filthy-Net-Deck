//! Stop Wine/Proton grabbing the pointer so overlay-layer surfaces can be
//! clicked while Arena is focused.
//!
//! Hyprland 0.56.2's `mouseMoveUnified` returns early when `isConstrained()`
//! is true — an active pointer lock/confine owned by the focused surface.
//! Overlay hit-testing never runs. Wine translates `ClipCursor` / fullscreen
//! mouse grab into that constraint, so a focused XWayland Arena swallows
//! every overlay click (badge, HUD, even a fresh GTK probe). Unfocusing Arena
//! makes the same probe clickable. MTG Arena is not an FPS; it does not need
//! the grab. Setting `GrabPointer`/`GrabFullscreen` to `N` in the prefix is
//! the durable fix. Takes effect the next time Wine starts.

use std::fs;
use std::path::{Path, PathBuf};

const SECTION: &str = "[Software\\\\Wine\\\\X11 Driver]";
const GRAB_POINTER: &str = "\"GrabPointer\"=\"N\"";
const GRAB_FULLSCREEN: &str = "\"GrabFullscreen\"=\"N\"";

/// Steam app id for MTG Arena.
const ARENA_APP_ID: &str = "2141910";

pub fn ensure_no_pointer_grab() {
    for path in prefix_user_regs() {
        match apply_to_user_reg(&path) {
            Ok(true) => {
                eprintln!(
                    "[wine-x11] wrote GrabPointer=N in {} — restart Arena for overlay clicks",
                    path.display()
                );
                return;
            }
            Ok(false) => return, // already set
            Err(e) => eprintln!("[wine-x11] {}: {e}", path.display()),
        }
    }
}

fn prefix_user_regs() -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(home) = std::env::var("HOME") {
        let home = PathBuf::from(home);
        for steam in [home.join(".local/share/Steam"), home.join(".steam/steam")] {
            out.push(
                steam
                    .join("steamapps/compatdata")
                    .join(ARENA_APP_ID)
                    .join("pfx/user.reg"),
            );
        }
    }
    out
}

fn apply_to_user_reg(path: &Path) -> Result<bool, String> {
    if !path.is_file() {
        return Err("prefix user.reg not found".into());
    }
    let original = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let Some(updated) = patched_user_reg(&original) else {
        return Ok(false);
    };
    fs::write(path, updated).map_err(|e| e.to_string())?;
    Ok(true)
}

/// Returns `None` when the file already has both keys.
fn patched_user_reg(src: &str) -> Option<String> {
    if src.contains(GRAB_POINTER) && src.contains(GRAB_FULLSCREEN) {
        return None;
    }
    if let Some(idx) = src.find(SECTION) {
        let after = &src[idx..];
        let end = after.find("\n[").map(|n| idx + n).unwrap_or(src.len());
        let mut section = src[idx..end].to_string();
        if !section.contains(GRAB_POINTER) {
            if !section.ends_with('\n') {
                section.push('\n');
            }
            section.push_str(GRAB_POINTER);
            section.push('\n');
        }
        if !section.contains(GRAB_FULLSCREEN) {
            if !section.ends_with('\n') {
                section.push('\n');
            }
            section.push_str(GRAB_FULLSCREEN);
            section.push('\n');
        }
        let mut out = String::with_capacity(src.len() + 64);
        out.push_str(&src[..idx]);
        out.push_str(&section);
        out.push_str(&src[end..]);
        return Some(out);
    }
    let mut out = src.to_string();
    if !out.ends_with('\n') {
        out.push('\n');
    }
    out.push('\n');
    out.push_str(SECTION);
    out.push('\n');
    out.push_str(GRAB_POINTER);
    out.push('\n');
    out.push_str(GRAB_FULLSCREEN);
    out.push('\n');
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skips_when_both_keys_present() {
        let src = format!("{SECTION}\n{GRAB_POINTER}\n{GRAB_FULLSCREEN}\n");
        assert!(patched_user_reg(&src).is_none());
    }

    #[test]
    fn appends_a_missing_section() {
        let src = "WINE REGISTRY Version 2\n";
        let out = patched_user_reg(src).unwrap();
        assert!(out.contains(SECTION));
        assert!(out.contains(GRAB_POINTER));
        assert!(out.contains(GRAB_FULLSCREEN));
    }

    #[test]
    fn inserts_into_an_existing_section() {
        let src = format!("{SECTION} 1\n#time=abc\n\"UseTakeFocus\"=\"N\"\n\n[Other]\n");
        let out = patched_user_reg(&src).unwrap();
        let section_end = out.find("[Other]").unwrap();
        let section = &out[..section_end];
        assert!(section.contains(GRAB_POINTER));
        assert!(section.contains(GRAB_FULLSCREEN));
        assert!(out.contains("[Other]"));
    }
}
