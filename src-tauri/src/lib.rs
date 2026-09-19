mod agent;
mod api_server;
mod commands;
mod i18n;
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
        // Keybindings + language of the last menu build (see `menu::MenuState`).
        .manage(menu::MenuState::default())
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
            commands::set_ui_locale,
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
            use tauri::Manager;
            // Build the native menu with the persisted keybindings and UI
            // language; a failed settings read falls back to built-in
            // accelerators and the system language. The webview pushes the
            // resolved language again on mount (`set_ui_locale`), which is what
            // covers a language change without a restart.
            let stored = settings::load(app.handle()).ok();
            let keybindings = stored
                .as_ref()
                .map(|s| s.keybindings.clone())
                .unwrap_or_default();
            let locale = i18n::resolve_locale(stored.as_ref().and_then(|s| s.language.as_deref()));
            // Remember both halves, so a rebuild triggered by either one has
            // the other (`rebuild_menu`, `set_ui_locale`).
            let menu_state = app.state::<menu::MenuState>();
            menu_state.set_keybindings(keybindings.clone());
            menu_state.set_locale(locale);
            menu::setup(app.handle(), &keybindings, locale)?;
            // The menu event route is registered once for the app's lifetime:
            // `menu::setup` runs on every rebuild, and `on_menu_event` appends
            // a handler per call, so registering it there delivered each click
            // once per rebuild.
            menu::route_events(app.handle());
            // System tray: always present, carries the agent attention count.
            if let Err(e) = tray::setup(app.handle(), locale) {
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
