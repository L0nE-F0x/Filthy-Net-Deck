mod arena;
mod overlay;
mod presence;
mod silent_update;
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

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn hide_to_tray(window: &tauri::Window) {
    let _ = window.hide();
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
    toast::show_toast(app, TITLE, BODY);
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
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
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
            silent_update::install_update_silent
        ])
        .setup(|app| {
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
            }

            overlay::load_enabled(app.handle());
            overlay::load_post_match(app.handle());
            toast::load_enabled(app.handle());
            toast::prewarm(app.handle());
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
