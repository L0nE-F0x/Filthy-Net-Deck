mod tracker;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(tracker::TrackerShared(Default::default()))
        .invoke_handler(tauri::generate_handler![
            tracker::tracker_status,
            tracker::tracker_matches,
            tracker::tracker_clear
        ])
        .setup(|app| {
            #[cfg(desktop)]
            {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
                app.handle().plugin(tauri_plugin_process::init())?;
            }

            // Winrate tracker: tail MTG Arena's Player.log in the background.
            tracker::start(app.handle().clone());

            let show_i =
                MenuItem::with_id(app, "show", "Open Filthy Net Deck", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &sep, &quit_i])?;

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
                api.prevent_close();
            }
            WindowEvent::Resized(_) => {
                if window.is_minimized().unwrap_or(false) {
                    let _ = window.unminimize();
                    hide_to_tray(window);
                }
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running Filthy Net Deck");
}
