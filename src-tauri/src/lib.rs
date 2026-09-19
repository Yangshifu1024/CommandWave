mod agent;
mod api_server;
mod commands;
mod menu;
mod pty;
mod secrets;
mod settings;
mod shell_integration;
mod state;
mod tray;

use state::PtyManager;

pub fn run() {
    // Agent hooks run this same binary with `--agent-event <event>`: report
    // the event to the running instance and exit without starting the GUI.
    let args: Vec<String> = std::env::args().collect();
    if agent::run_event_cli(&args) {
        return;
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notifications::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(PtyManager::new())
        .invoke_handler(tauri::generate_handler![
            commands::pty_create,
            commands::pty_write,
            commands::pty_resize,
            commands::pty_close,
            commands::pty_attach,
            commands::secrets_list,
            commands::secrets_upsert,
            commands::secrets_delete,
            commands::settings_load,
            commands::settings_save,
            commands::show_main_window,
            commands::rebuild_menu,
            commands::open_with_editor,
            commands::set_progress,
            commands::set_window_blur,
            commands::window_is_transparent,
            commands::agent_registry,
            commands::agent_install,
            commands::agent_uninstall,
            commands::agent_attention_update,
            commands::restart_app,
            commands::active_session_count
        ])
        .setup(|app| {
            // Build the native menu with the persisted keybindings; a failed
            // settings read falls back to built-in accelerators.
            let keybindings = settings::load(app.handle())
                .map(|s| s.keybindings)
                .unwrap_or_default();
            menu::setup(app.handle(), &keybindings)?;
            // System tray: always present, carries the agent attention count.
            if let Err(e) = tray::setup(app.handle()) {
                eprintln!("tray setup failed: {e}");
            }
            // Local scripting API (loopback HTTP; port/token in api.json).
            if let Err(e) = api_server::start(app.handle().clone()) {
                eprintln!("api server failed to start: {e}");
            }
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
