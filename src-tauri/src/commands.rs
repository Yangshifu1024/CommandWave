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
    eprintln!("[cw-write] pty={} data={:?}", pty_id, data);
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
pub fn pty_resize(
    state: State<PtyManager>,
    pty_id: u32,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
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
pub fn rebuild_menu(
    app: AppHandle,
    keybindings: std::collections::HashMap<String, String>,
) -> Result<(), String> {
    crate::menu::setup(&app, &keybindings).map_err(|e| e.to_string())
}

/// Hand an existing PTY session's output to a new window (pane detach).
/// Replaces the previous channel: only the new webview receives output.
#[tauri::command]
pub fn pty_attach(
    state: State<PtyManager>,
    pty_id: u32,
    on_output: Channel<Vec<u8>>,
) -> Result<(), String> {
    state
        .sessions
        .lock()
        .unwrap()
        .get(&pty_id)
        .ok_or_else(|| format!("pty {pty_id} not found"))?
        .router
        .replace(on_output);
    Ok(())
}

// ---------- Secrets vault (client-side encrypted blobs) ----------

#[tauri::command]
pub fn secrets_list(app: AppHandle) -> Vec<crate::secrets::SecretBlob> {
    crate::secrets::load(&app).entries
}

#[tauri::command]
pub fn secrets_upsert(app: AppHandle, entry: crate::secrets::SecretBlob) -> Result<(), String> {
    let mut file = crate::secrets::load(&app);
    match file.entries.iter().position(|e| e.name == entry.name) {
        Some(i) => file.entries[i] = entry,
        None => file.entries.push(entry),
    }
    crate::secrets::save(&app, &file).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn secrets_delete(app: AppHandle, name: String) -> Result<(), String> {
    let mut file = crate::secrets::load(&app);
    file.entries.retain(|e| e.name != name);
    crate::secrets::save(&app, &file).map_err(|e| e.to_string())
}

// ---------- Agent notifications (Tier 3 integrations + attention) ----------

/// Every known agent with detection + install state, for the Integrations UI.
#[tauri::command]
pub fn agent_registry(app: AppHandle) -> Vec<crate::agent::AgentInfo> {
    crate::agent::list(&app)
}

/// Install CommandWave's hooks into an agent's config (with backup/preview).
#[tauri::command]
pub fn agent_install(
    app: AppHandle,
    agent_id: String,
) -> Result<crate::agent::InstallOutcome, String> {
    let outcome = crate::agent::install(&app, &agent_id)?;
    set_agent_installed(&app, &agent_id, true)?;
    Ok(outcome)
}

/// Remove CommandWave's hooks / restore the backed-up config.
#[tauri::command]
pub fn agent_uninstall(
    app: AppHandle,
    agent_id: String,
) -> Result<crate::agent::InstallOutcome, String> {
    let outcome = crate::agent::uninstall(&app, &agent_id)?;
    set_agent_installed(&app, &agent_id, false)?;
    Ok(outcome)
}

fn set_agent_installed(app: &AppHandle, agent_id: &str, installed: bool) -> Result<(), String> {
    let mut settings = settings::load(app).map_err(|e| e.to_string())?;
    settings.notifications.integrations.insert(
        agent_id.to_string(),
        crate::settings::IntegrationState {
            enabled: installed,
            installed,
        },
    );
    settings::save(app, &settings).map_err(|e| e.to_string())
}

/// Push the current attention set to the tray and the macOS Dock badge.
///
/// The Dock badge is the agent-attention surface exclusively; terminal progress
/// has its own (see `set_progress`).
#[tauri::command]
pub fn agent_attention_update(
    app: AppHandle,
    items: Vec<crate::tray::AttentionItem>,
    count: u32,
) -> Result<(), String> {
    crate::tray::update(&app, &items, count).map_err(|e| e.to_string())?;
    // macOS: the count is the Dock badge (the tray carries it as menu-bar text).
    #[cfg(target_os = "macos")]
    {
        use tauri::Manager;
        if let Some(window) = app.get_webview_window("main") {
            let badge = if count == 0 { None } else { Some(count as i64) };
            let _ = window.set_badge_count(badge);
        }
    }
    Ok(())
}

// ---------- In-app auto-update ----------

/// Relaunch the app after the user accepted an update. `AppHandle::restart`
/// diverges (returns `!`), so this command never returns normally.
#[tauri::command]
pub fn restart_app(app: AppHandle) {
    app.restart();
}

/// Live PTY session count, used by the updater dialog to warn the user about
/// how many sessions a restart would tear down.
#[tauri::command]
pub fn active_session_count(state: State<PtyManager>) -> usize {
    state
        .sessions
        .lock()
        .unwrap()
        .values()
        .filter(|session| !session.is_closed())
        .count()
}

/// Open a file with the user's editor command ("code {file}" etc.).
#[tauri::command]
pub fn open_with_editor(editor_command: String, file: String) -> Result<(), String> {
    let mut parts = editor_command
        .replace("{file}", &file)
        .split_whitespace()
        .map(String::from)
        .collect::<Vec<_>>();
    if parts.is_empty() {
        return Err("empty editor command".into());
    }
    let program = parts.remove(0);
    std::process::Command::new(program)
        .args(&parts)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// Show a progress value (0–100) on the taskbar/dock; None clears it.
/// OSC 9;4 from the terminal feeds this. Windows taskbar, GTK panels with
/// libunity, and the macOS Dock's progress indicator.
#[tauri::command]
pub fn set_progress(app: AppHandle, value: Option<f64>) -> Result<(), String> {
    use tauri::Manager;
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };
    let state = match value {
        Some(v) => {
            let v = v.clamp(0.0, 100.0) as u64;
            tauri::window::ProgressBarState {
                status: Some(tauri::window::ProgressBarStatus::Normal),
                progress: Some(v),
            }
        }
        None => tauri::window::ProgressBarState {
            status: Some(tauri::window::ProgressBarStatus::None),
            progress: None,
        },
    };
    let _ = window.set_progress_bar(state);
    // The Dock badge is deliberately left untouched here. macOS draws this
    // progress in the Dock's own progress indicator (above), and the badge
    // belongs to agent attention. Mirroring the percent into the badge used to
    // overwrite the attention count, and then clear the badge when the command
    // finished -- even with panes still waiting on the user.
    Ok(())
}

/// Whether the main window was created with OS transparency (from the
/// embedded tauri.conf.json). Transparent WebView2 windows show a thin
/// white edge line under Windows DWM, so transparency is opt-in there.
#[tauri::command]
pub fn window_is_transparent(app: AppHandle) -> bool {
    app.config()
        .app
        .windows
        .iter()
        .find(|w| w.label == "main")
        .map(|w| w.transparent)
        .unwrap_or(false)
}

/// Window-level blur behind a translucent window (acrylic / HUD material).
/// No-op on platforms without a blur effect; the webview stays transparent
/// regardless, so unsupported platforms just show plain translucency.
#[tauri::command]
pub fn set_window_blur(app: AppHandle, enabled: bool) -> Result<(), String> {
    use tauri::Manager;
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };
    let effects = if enabled {
        #[cfg(target_os = "windows")]
        let list = vec![tauri::window::Effect::Acrylic, tauri::window::Effect::Blur];
        #[cfg(target_os = "macos")]
        let list = vec![
            tauri::window::Effect::HudWindow,
            tauri::window::Effect::Popover,
            tauri::window::Effect::UnderWindowBackground,
        ];
        #[cfg(not(any(target_os = "windows", target_os = "macos")))]
        let list: Vec<tauri::window::Effect> = vec![];
        tauri::window::EffectsBuilder::new()
            .effects(list)
            .state(tauri::window::EffectState::Active)
            .build()
    } else {
        tauri::window::EffectsBuilder::new().build()
    };
    window.set_effects(effects).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    /// Collect every Rust source file under `dir`, recursively.
    fn rust_sources(dir: &std::path::Path, out: &mut Vec<std::path::PathBuf>) {
        for entry in std::fs::read_dir(dir).expect("backend source dir") {
            let path = entry.expect("dir entry").path();
            if path.is_dir() {
                rust_sources(&path, out);
            } else if path.extension().is_some_and(|ext| ext == "rs") {
                out.push(path);
            }
        }
    }

    /// The Dock badge is a single-number surface, so it must have exactly one
    /// writer. A second one silently overwrites the first: `set_progress` used
    /// to stamp the terminal's progress percent into the badge, which wiped the
    /// agent attention count and then cleared the badge when the command
    /// finished, even with panes still waiting on the user. Progress has its own
    /// surface (the Dock progress indicator that `set_progress_bar` drives, the
    /// taskbar elsewhere), so nothing but attention belongs in the badge.
    #[test]
    fn dock_badge_has_a_single_writer() {
        // Split, so this test's own text is not counted as a call site.
        let call = concat!(".set_badge", "_count(");
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
        let mut sources = Vec::new();
        rust_sources(&root, &mut sources);
        assert!(sources.len() > 5, "expected to walk the backend sources");

        let mut writers = Vec::new();
        for path in &sources {
            let text = std::fs::read_to_string(path).expect("readable source");
            for (index, line) in text.lines().enumerate() {
                // Prose may name the API; only code counts.
                if line.trim_start().starts_with("//") || !line.contains(call) {
                    continue;
                }
                writers.push(format!("{}:{}", path.display(), index + 1));
            }
        }
        assert_eq!(
            writers.len(),
            1,
            "the Dock badge must have a single writer (agent attention), found \
             {}: {writers:?}",
            writers.len()
        );
    }
}
