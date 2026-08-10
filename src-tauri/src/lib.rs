mod arena;
mod deeplink;
mod install_id;
mod overlay;
mod presence;
mod toast;
mod tracker;

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

/// Set by tray → Quit. `app.exit(0)` asks every window to close, and the
/// close handler below hides the main window instead of letting it go — so
/// without this flag the quit is swallowed and the process never dies
/// (Task Manager was the only way out).
static QUITTING: AtomicBool = AtomicBool::new(false);

/// Thread that owns the event loop, captured in `setup()`.
static MAIN_THREAD: std::sync::OnceLock<std::thread::ThreadId> = std::sync::OnceLock::new();

/// Guard against this crate's most expensive recurring bug.
///
/// `WebviewWindowBuilder::build()` **must not** run on the event-loop thread on
/// Windows: the window is created but `build()` never returns, wedging every
/// later main-thread task — tray Quit included. It has now been reintroduced
/// four times (toast.rs 2026-07-22; arena.rs, `presence_set_enabled` and
/// `toast_show` 2026-08-09), each time from a different direction, because
/// "am I on the main thread?" is invisible at the call site — synchronous
/// `#[tauri::command]`s and `on_window_event` handlers both run there.
///
/// Call this at the top of any function that builds a webview. It refuses the
/// build rather than hanging the app, and panics in debug so it is caught in
/// `tauri:dev` rather than in a user's release build.
#[must_use]
pub(crate) fn refuse_if_main_thread(who: &str) -> bool {
    let Some(main) = MAIN_THREAD.get() else {
        return false; // setup() hasn't run — nothing is built this early.
    };
    if *main != std::thread::current().id() {
        return false;
    }
    let msg = format!(
        "[fnd] REFUSED: {who} tried to build a webview on the main thread — \
         that deadlocks the Windows event loop. Do the create on a worker \
         thread (Tauri hops internally); keep only show/destroy on main."
    );
    eprintln!("{msg}");
    debug_assert!(false, "{}", msg);
    true
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn hide_to_tray(window: &tauri::Window) {
    // Windows frequently ignores hide()/close while the window is still in
    // exclusive fullscreen — Exit / Close-to-tray then look dead. Drop
    // fullscreen first so the hide sticks.
    let _ = window.set_fullscreen(false);
    let _ = window.hide();
}

/// Frontend: set main-window fullscreen. Prefer this over the raw window
/// plugin from JS so we always target the `main` label (not overlay/toast).
#[tauri::command]
fn main_window_set_fullscreen(app: tauri::AppHandle, on: bool) -> Result<(), String> {
    let win = app
        .get_webview_window("main")
        .ok_or_else(|| "main window missing".to_string())?;
    win.set_fullscreen(on).map_err(|e| e.to_string())
}

/// Frontend: exit fullscreen (if any) and hide to tray. Same path as the
/// titlebar ✕, including the one-time "still running in the tray" hint.
#[tauri::command]
fn main_window_hide_to_tray(app: tauri::AppHandle) -> Result<(), String> {
    let win = app
        .get_webview_window("main")
        .ok_or_else(|| "main window missing".to_string())?;
    // WebviewWindow and Window share set_fullscreen / hide on the handle.
    let _ = win.set_fullscreen(false);
    let _ = win.hide();
    notify_tray_hint_once(&app);
    Ok(())
}

/// One-time toast the first time the window closes to the tray, so users
/// know the tracker is still running instead of thinking the app quit.
fn notify_tray_hint_once(app: &tauri::AppHandle) {
    let Ok(dir) = app.path().app_data_dir() else {
        return;
    };
    let marker = dir.join("tray-hint-shown");
    if marker.exists() {
        return;
    }
    let _ = std::fs::create_dir_all(&dir);
    let _ = std::fs::write(&marker, b"1");
    const TITLE: &str = "Still running in the tray";
    const BODY: &str = "Filthy Net Deck keeps tracking Arena from the system tray. Right-click the tray icon to quit for real.";
    // Off the calling thread on purpose. Both call sites (the CloseRequested
    // window event and the `main_window_hide_to_tray` command) run on the main
    // thread, and `show_toast` has to *build* the toast webview now that it is
    // no longer prewarmed at boot. `WebviewWindowBuilder::build()` on the event
    // loop deadlocks it on Windows, which would wedge the tray menu's
    // `app.exit(0)` — the exact bug that made Quit require Task Manager.
    let handle = app.clone();
    std::thread::spawn(move || {
        toast::show_toast(&handle, TITLE, BODY);
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default();

    // Single-instance must be the first plugin registered. A second launch
    // (taskbar shortcut, double-clicked exe) surfaces the running window
    // instead of spawning a duplicate app + second tray icon.
    #[cfg(desktop)]
    {
        // A second launch surfaces the running window instead of spawning a
        // duplicate. It is also how `fnd://` deep links reach an already-running
        // app on Windows: the OS starts a new process with the URL in argv and
        // this hook forwards that argv here. Dropping `args` on the floor would
        // silently break the OAuth callback in the *common* case — the user
        // clicked "sign in" from inside the running app.
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            show_main_window(app);
            deeplink::handle_argv(app, &args);
        }));
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(tracker::TrackerShared(Default::default()))
        .invoke_handler(tauri::generate_handler![
            tracker::tracker_status,
            tracker::tracker_matches,
            tracker::tracker_live,
            tracker::tracker_clear,
            tracker::tracker_delete_matches,
            tracker::tracker_export_csv,
            tracker::tracker_export_diagnostic,
            overlay::overlay_set_enabled,
            overlay::overlay_is_enabled,
            overlay::overlay_get_geometry,
            overlay::overlay_save_geometry,
            overlay::overlay_set_click_through,
            overlay::overlay_set_post_match,
            tracker::notify_set_match_end,
            toast::toast_set_enabled,
            toast::toast_show,
            toast::toast_pending,
            presence::presence_set_enabled,
            presence::presence_is_enabled,
            presence::presence_set_size,
            presence::presence_open_main,
            arena::arena_is_running,
            main_window_set_fullscreen,
            main_window_hide_to_tray,
            install_id::install_id_get,
            install_id::install_id_ensure,
            install_id::install_id_clear
        ])
        .setup(|app| {
            // Baseline for `refuse_if_main_thread` — setup runs on the event loop.
            let _ = MAIN_THREAD.set(std::thread::current().id());
            #[cfg(desktop)]
            {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
                app.handle().plugin(tauri_plugin_process::init())?;
                // "Start with Windows" opt-in (Settings). --hidden boots
                // straight to the tray so login isn't interrupted.
                app.handle().plugin(tauri_plugin_autostart::init(
                    tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                    Some(vec!["--hidden"]),
                ))?;
                // Remember window size/position between launches. Visibility
                // is excluded: --hidden / tray logic owns that. Overlay is
                // denylisted so its position is not restored over the main UI.
                app.handle().plugin(
                    tauri_plugin_window_state::Builder::new()
                        .with_state_flags(
                            tauri_plugin_window_state::StateFlags::all()
                                - tauri_plugin_window_state::StateFlags::VISIBLE,
                        )
                        .with_denylist(&["overlay"])
                        .build(),
                )?;
                if std::env::args().any(|a| a == "--hidden") {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.hide();
                    }
                }

                app.handle().plugin(tauri_plugin_deep_link::init())?;
                {
                    use tauri_plugin_deep_link::DeepLinkExt;
                    // Cold-start route: the app was NOT running when the link
                    // was opened. (The already-running route goes through the
                    // single-instance hook above — both are needed.)
                    let handle = app.handle().clone();
                    app.deep_link().on_open_url(move |event| {
                        for url in event.urls() {
                            deeplink::handle_url(&handle, url.as_str());
                        }
                    });
                    // Dev builds are not installed, so nothing registered the
                    // scheme in the registry. Do it at runtime so `tauri:dev`
                    // can exercise the flow at all; in a release build the NSIS
                    // installer owns this and the call is a harmless no-op.
                    #[cfg(debug_assertions)]
                    if let Err(e) = app.deep_link().register_all() {
                        eprintln!("[deeplink] dev scheme registration failed: {e}");
                    }
                }
            }

            overlay::load_enabled(app.handle());
            overlay::load_post_match(app.handle());
            toast::load_enabled(app.handle());
            // Do not prewarm toast/overlay/presence at boot — each is a full
            // WebView2 renderer. Overlay + presence warm when Arena launches;
            // toast builds on the first alert and is destroyed after it fades.
            presence::load_enabled(app.handle());
            tracker::load_notify_match_end(app.handle());

            // Winrate tracker: tail MTG Arena's Player.log in the background.
            tracker::start(app.handle().clone());
            // "Is Arena up?" — drives the corner presence badge. The tracker
            // only ever knew about matches, not the client being open.
            arena::start(app.handle().clone());

            let show_i =
                MenuItem::with_id(app, "show", "Open Filthy Net Deck", true, None::<&str>)?;
            let overlay_i = CheckMenuItem::with_id(
                app,
                "overlay",
                "In-game overlay",
                true,
                overlay::is_enabled(),
                None::<&str>,
            )?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &overlay_i, &sep, &quit_i])?;

            let icon = app
                .default_window_icon()
                .expect("app icon missing — run `npx tauri icon`")
                .clone();

            let _tray = TrayIconBuilder::with_id("fnd-tray")
                .icon(icon)
                .menu(&menu)
                .tooltip("Filthy Net Deck — MTG Arena companion")
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "overlay" => {
                        let next = !overlay::is_enabled();
                        overlay::set_enabled(app, next);
                    }
                    "quit" => {
                        QUITTING.store(true, Ordering::SeqCst);
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            } else {
                                show_main_window(app);
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        // Only `main` hides to the tray. The overlay, toast and presence
        // webviews are Rust-owned chrome: if this handler catches them too, a
        // stray minimize event hides the very window we just asked to show.
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            match event {
                // During a tray quit the close must go through, or `app.exit`
                // is swallowed and the process survives.
                WindowEvent::CloseRequested { api, .. } if !QUITTING.load(Ordering::SeqCst) => {
                    hide_to_tray(window);
                    notify_tray_hint_once(window.app_handle());
                    api.prevent_close();
                }
                WindowEvent::Resized(_) if window.is_minimized().unwrap_or(false) => {
                    let _ = window.unminimize();
                    hide_to_tray(window);
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Filthy Net Deck");
}
