//! `fnd://` deep links — the OAuth callback path.
//!
//! Google refuses OAuth from embedded webviews, so sign-in must go out to the
//! system browser and come back. The browser lands on a page we host, which
//! bounces to `fnd://auth?code=…`; Windows then hands that URL to the app.
//!
//! Two delivery routes exist and **both** must be handled, which is the part
//! that is easy to get wrong:
//!
//! 1. **App already running** — Windows starts a *second* process with the URL
//!    in `argv`. `tauri-plugin-single-instance` forwards that argv to the
//!    running instance and kills the new one (see `lib.rs`). Without parsing
//!    argv there, the link is silently dropped, which is the common case since
//!    the user just clicked "sign in" *in* the app.
//! 2. **App not running** — the plugin's `on_open_url` handler fires at start.
//!
//! Both funnel into [`handle_url`], which forwards to the webview as a
//! `deep-link` event.

use tauri::{AppHandle, Emitter};

pub const EVENT: &str = "deep-link";
const SCHEME: &str = "fnd://";

/// Pull the first `fnd://` argument out of a process argv.
///
/// Windows appends the URL to the command line, but the position is not
/// guaranteed (installers and shortcuts can prepend their own flags), so scan
/// rather than index. Exposed for tests.
pub fn find_deep_link(args: &[String]) -> Option<String> {
    args.iter()
        .find(|a| a.trim_start().to_ascii_lowercase().starts_with(SCHEME))
        .map(|a| a.trim().to_string())
}

/// Surface the main window and forward the URL to the webview.
///
/// The payload is passed through untouched: parsing OAuth params is the
/// frontend's job, and Rust has no business handling a token it does not need.
///
/// This broadcasts rather than targeting `main`, and that is a **deliberate
/// non-change** (v3.0.0 audit). The URL carries a live OAuth authorization
/// code, and `app.emit` hands it to all four webviews when only `App.tsx` in
/// `main` listens — so `emit_to("main", …)` looks strictly tighter.
///
/// It was tried and reverted. All four webviews are the same origin in the
/// same process, so no privilege boundary is being crossed and the "leak" is
/// to first-party code that ignores it — the benefit is close to zero. Against
/// that, `emit_to`'s `EventTarget` matching could not be verified here without
/// a real OAuth round trip (the URI scheme is registered by NSIS, so
/// `tauri:dev` cannot exercise the cold-start route at all — see the module
/// docs). Trading an unverifiable risk to the sign-in path for a cosmetic
/// tightening is a bad deal, particularly right before a launch.
///
/// Worth doing later, behind a real end-to-end test in an installed build.
pub fn handle_url(app: &AppHandle, url: &str) {
    if !url.to_ascii_lowercase().starts_with(SCHEME) {
        return;
    }
    crate::show_main_window(app);
    if let Err(e) = app.emit(EVENT, url.to_string()) {
        eprintln!("[deeplink] emit failed: {e}");
    }
}

/// Convenience for the single-instance hook.
pub fn handle_argv(app: &AppHandle, args: &[String]) {
    if let Some(url) = find_deep_link(args) {
        handle_url(app, &url);
    }
}

#[cfg(test)]
mod tests {
    use super::find_deep_link;

    fn v(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn finds_the_url_anywhere_in_argv() {
        assert_eq!(
            find_deep_link(&v(&["app.exe", "fnd://auth?code=abc"])).as_deref(),
            Some("fnd://auth?code=abc")
        );
        // Not always the last argument.
        assert_eq!(
            find_deep_link(&v(&["app.exe", "fnd://auth?code=abc", "--flag"])).as_deref(),
            Some("fnd://auth?code=abc")
        );
    }

    #[test]
    fn is_case_insensitive_on_the_scheme() {
        assert_eq!(
            find_deep_link(&v(&["app.exe", "FND://auth?code=x"])).as_deref(),
            Some("FND://auth?code=x")
        );
    }

    #[test]
    fn trims_surrounding_whitespace() {
        assert_eq!(
            find_deep_link(&v(&["app.exe", "  fnd://auth?code=x  "])).as_deref(),
            Some("fnd://auth?code=x")
        );
    }

    #[test]
    fn ignores_ordinary_arguments() {
        assert_eq!(find_deep_link(&v(&["app.exe", "--hidden"])), None);
        assert_eq!(find_deep_link(&v(&[])), None);
        // A different app's scheme must not match.
        assert_eq!(find_deep_link(&v(&["app.exe", "fndx://auth"])), None);
        // Substring matches are not links.
        assert_eq!(find_deep_link(&v(&["app.exe", "https://x/fnd://y"])), None);
    }
}
