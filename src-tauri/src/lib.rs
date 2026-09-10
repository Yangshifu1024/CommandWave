mod commands;
mod menu;
mod pty;
mod settings;
mod shell_integration;
mod state;

use state::PtyManager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .manage(PtyManager::new())
        .invoke_handler(tauri::generate_handler![
            commands::pty_create,
            commands::pty_write,
            commands::pty_resize,
            commands::pty_close,
            commands::settings_load,
            commands::settings_save,
            commands::show_main_window,
            commands::rebuild_menu
        ])
        .setup(|app| {
            // Build the native menu with the persisted keybindings; a failed
            // settings read falls back to built-in accelerators.
            let keybindings = settings::load(app.handle())
                .map(|s| s.keybindings)
                .unwrap_or_default();
            menu::setup(app.handle(), &keybindings)?;
            // Frameless window on Windows/Linux (custom title bar in the
            // webview); macOS keeps native chrome with an overlaid title.
            #[cfg(not(target_os = "macos"))]
            {
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_decorations(false);
                    let _ = window.show();
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
