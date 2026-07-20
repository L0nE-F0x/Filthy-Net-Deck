mod overlay;
mod silent_update;
mod tracker;

use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

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
    use tauri_plugin_notification::NotificationExt;
    let Ok(dir) = app.path().app_data_dir() else {
        return;
    };
    let marker = dir.join("tray-hint-shown");
    if marker.exists() {
        return;
    }
    let _ = std::fs::create_dir_all(&dir);
    let _ = std::fs::write(&marker, b"1");
    let _ = app
        .notification()
        .builder()
        .title("Still running in the tray")
        .body("Filthy Net Deck keeps tracking Arena from the system tray. Right-click the tray icon to quit for real.")
        .show();
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
        .plugin(tauri_plugin_notification::init())
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

            // Winrate tracker: tail MTG Arena's Player.log in the background.
            tracker::start(app.handle().clone());

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
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api, .. } => {
                hide_to_tray(window);
                notify_tray_hint_once(window.app_handle());
                api.prevent_close();
            }
            WindowEvent::Resized(_) if window.is_minimized().unwrap_or(false) => {
                let _ = window.unminimize();
                hide_to_tray(window);
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running Filthy Net Deck");
}
