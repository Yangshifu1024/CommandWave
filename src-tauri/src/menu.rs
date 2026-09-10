#[cfg(target_os = "macos")]
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    Emitter, Manager, Wry,
};
use tauri::AppHandle as BaseAppHandle;
#[cfg(not(target_os = "macos"))]
use tauri::Wry;

use std::collections::HashMap;

/// Built-in accelerators, used whenever the settings carry no override for
/// an action. Must stay in sync with `src/hooks/keybindings.ts`.
pub fn default_accelerator(action: &str) -> Option<&'static str> {
    Some(match action {
        "open-settings" => "CmdOrCtrl+,",
        "new-tab" => "CmdOrCtrl+T",
        "close-pane" => "CmdOrCtrl+W",
        "close-tab" => "Shift+CmdOrCtrl+W",
        "split-right" => "CmdOrCtrl+D",
        "split-down" => "Shift+CmdOrCtrl+D",
        "prev-pane" => "CmdOrCtrl+[",
        "next-pane" => "CmdOrCtrl+]",
        "toggle-vertical-tabs" => "Shift+CmdOrCtrl+B",
        "open-search" => "CmdOrCtrl+F",
        "prev-mark" => "CmdOrCtrl+Up",
        "next-mark" => "CmdOrCtrl+Down",
        // Menu items without default bindings.
        "copy-last-output" | "clear-buffer" => return None,
        _ => return None,
    })
}

fn accel(overrides: &HashMap<String, String>, action: &str) -> Option<String> {
    if let Some(custom) = overrides.get(action) {
        if custom.is_empty() {
            return None; // explicitly unbound
        }
        return Some(custom.clone());
    }
    default_accelerator(action).map(|s| s.to_string())
}

/// Build the native application menu (iTerm2-style) and route menu events to
/// the focused webview as `cw-menu` events. Explicit accelerators here also
/// prevent macOS' default menu from intercepting keys like Cmd+W.
///
/// macOS keeps this native menu (system convention); Windows and Linux use
/// the custom in-window title bar menu instead, so no native menu is
/// attached there (see `TitleBar.tsx`).
#[cfg(target_os = "macos")]
pub fn setup(
    app: &BaseAppHandle<Wry>,
    keybindings: &HashMap<String, String>,
) -> tauri::Result<()> {
    let item = |id: &str, label: &str| -> tauri::Result<MenuItem<Wry>> {
        MenuItem::with_id(
            app,
            id,
            label,
            true,
            accel(keybindings, id),
        )
    };

    let app_submenu = Submenu::with_id(app, "cw-app", "CommandWave", true)?;
    app_submenu.append(&PredefinedMenuItem::about(
        app,
        Some("CommandWave"),
        None,
    )?)?;
    app_submenu.append(&PredefinedMenuItem::separator(app)?)?;
    app_submenu.append(&item("open-settings", "Settings…")?)?;
    app_submenu.append(&PredefinedMenuItem::separator(app)?)?;
    app_submenu.append(&PredefinedMenuItem::hide(app, None)?)?;
    app_submenu.append(&PredefinedMenuItem::hide_others(app, None)?)?;
    app_submenu.append(&PredefinedMenuItem::separator(app)?)?;
    app_submenu.append(&PredefinedMenuItem::quit(app, None)?)?;

    let edit = Submenu::with_id(app, "cw-edit", "Edit", true)?;
    edit.append(&PredefinedMenuItem::undo(app, None)?)?;
    edit.append(&PredefinedMenuItem::redo(app, None)?)?;
    edit.append(&PredefinedMenuItem::separator(app)?)?;
    edit.append(&PredefinedMenuItem::cut(app, None)?)?;
    edit.append(&PredefinedMenuItem::copy(app, None)?)?;
    edit.append(&PredefinedMenuItem::paste(app, None)?)?;
    edit.append(&item("copy-last-output", "Copy Last Output")?)?;
    edit.append(&PredefinedMenuItem::separator(app)?)?;
    edit.append(&PredefinedMenuItem::select_all(app, None)?)?;
    edit.append(&item("clear-buffer", "Clear Buffer")?)?;

    let shell = Submenu::with_id(app, "cw-shell", "Shell", true)?;
    shell.append(&item("new-tab", "New Tab")?)?;
    shell.append(&item("close-pane", "Close Pane")?)?;
    shell.append(&item("close-tab", "Close Tab")?)?;
    shell.append(&PredefinedMenuItem::separator(app)?)?;
    shell.append(&item("split-right", "Split Pane Right")?)?;
    shell.append(&item("split-down", "Split Pane Down")?)?;
    shell.append(&PredefinedMenuItem::separator(app)?)?;
    shell.append(&item("prev-pane", "Previous Pane")?)?;
    shell.append(&item("next-pane", "Next Pane")?)?;

    let view = Submenu::with_id(app, "cw-view", "View", true)?;
    view.append(&item("toggle-vertical-tabs", "Toggle Vertical Tabs")?)?;
    view.append(&PredefinedMenuItem::separator(app)?)?;
    view.append(&item("open-search", "Search…")?)?;
    view.append(&PredefinedMenuItem::separator(app)?)?;
    view.append(&item("prev-mark", "Previous Prompt")?)?;
    view.append(&item("next-mark", "Next Prompt")?)?;

    let window = Submenu::with_id(app, "cw-window", "Window", true)?;
    window.append(&PredefinedMenuItem::minimize(app, None)?)?;
    window.append(&PredefinedMenuItem::maximize(app, None)?)?;

    let menu = Menu::new(app)?;
    menu.append(&app_submenu)?;
    menu.append(&edit)?;
    menu.append(&shell)?;
    menu.append(&view)?;
    menu.append(&window)?;
    app.set_menu(menu)?;

    app.on_menu_event(|app, event| {
        let id = event.id().as_ref().to_string();
        // Only the focused window acts, so the dropdown doesn't mirror the
        // main window's commands.
        let mut delivered = false;
        for (_, webview) in app.webview_windows() {
            if webview.is_focused().unwrap_or(false) {
                let _ = webview.emit("cw-menu", id.clone());
                delivered = true;
            }
        }
        if !delivered {
            let _ = app.emit("cw-menu", id);
        }
    });
    Ok(())
}

/// No native menu on Windows/Linux: the custom title bar menu (TitleBar.tsx)
/// owns these commands in-window.
#[cfg(not(target_os = "macos"))]
pub fn setup(
    _app: &BaseAppHandle<Wry>,
    _keybindings: &HashMap<String, String>,
) -> tauri::Result<()> {
    Ok(())
}
