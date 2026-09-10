use tauri::ipc::Channel;
use tauri::{AppHandle, State};

use crate::pty::{self, PtyCreateOptions, PtyCreated};
use crate::settings::{self, Settings};
use crate::state::PtyManager;

#[tauri::command]
pub fn pty_create(
    app: AppHandle,
    state: State<PtyManager>,
    options: PtyCreateOptions,
    on_output: Channel<Vec<u8>>,
) -> Result<PtyCreated, String> {
    pty::spawn_session(&state, app, options, on_output).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_write(state: State<PtyManager>, pty_id: u32, data: String) -> Result<(), String> {
    state
        .sessions
        .lock()
        .unwrap()
        .get(&pty_id)
        .ok_or_else(|| format!("pty {pty_id} not found"))?
        .write(&data)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_resize(state: State<PtyManager>, pty_id: u32, rows: u16, cols: u16) -> Result<(), String> {
    state
        .sessions
        .lock()
        .unwrap()
        .get(&pty_id)
        .ok_or_else(|| format!("pty {pty_id} not found"))?
        .resize(rows, cols)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_close(state: State<PtyManager>, pty_id: u32) -> Result<(), String> {
    pty::close_session(&state, pty_id);
    Ok(())
}

#[tauri::command]
pub fn settings_load(app: AppHandle) -> Result<Settings, String> {
    settings::load(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn settings_save(app: AppHandle, new_settings: Settings) -> Result<(), String> {
    settings::save(&app, &new_settings).map_err(|e| e.to_string())
}

/// Reveal the main window once the frontend has mounted. The window is
/// created hidden (`visible: false`) so the custom title bar paints before
/// first show; macOS relies on this invocation because timers and rAF are
/// suspended in a hidden webview. Windows/Linux show from Rust setup.
#[tauri::command]
pub fn show_main_window(app: AppHandle) -> Result<(), String> {
    use tauri::Manager;
    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(|e| e.to_string())?;
        let _ = window.set_focus();
    }
    Ok(())
}

/// Rebuild the native menu with customized accelerators.
#[tauri::command]
pub fn rebuild_menu(app: AppHandle, keybindings: std::collections::HashMap<String, String>) -> Result<(), String> {
    crate::menu::setup(&app, &keybindings).map_err(|e| e.to_string())
}
