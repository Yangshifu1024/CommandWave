#[cfg(target_os = "macos")]
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    AppHandle, Emitter, Manager, Wry,
};

#[cfg(not(target_os = "macos"))]
use tauri::{AppHandle, Wry};

/// Build the native application menu (iTerm2-style) and route menu events to
/// the focused webview as `cw-menu` events. Explicit accelerators here also
/// prevent macOS' default menu from intercepting keys like Cmd+W.
///
/// macOS keeps this native menu (system convention); Windows and Linux use
/// the custom in-window title bar menu instead, so no native menu is
/// attached there (see `TitleBar.tsx`).
#[cfg(target_os = "macos")]
pub fn setup(app: &AppHandle<Wry>) -> tauri::Result<()> {
    let app_submenu = Submenu::with_id(app, "cw-app", "CommandWave", true)?;
    app_submenu.append(&PredefinedMenuItem::about(
        app,
        Some("CommandWave"),
        None,
    )?)?;
    app_submenu.append(&PredefinedMenuItem::separator(app)?)?;
    app_submenu.append(&MenuItem::with_id(
        app,
        "open-settings",
        "Settings…",
        true,
        Some("CmdOrCtrl+,"),
    )?)?;
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
    edit.append(&PredefinedMenuItem::select_all(app, None)?)?;

    let shell = Submenu::with_id(app, "cw-shell", "Shell", true)?;
    shell.append(&MenuItem::with_id(
        app,
        "new-tab",
        "New Tab",
        true,
        Some("CmdOrCtrl+T"),
    )?)?;
    shell.append(&MenuItem::with_id(
        app,
        "close-pane",
        "Close Pane",
        true,
        Some("CmdOrCtrl+W"),
    )?)?;
    shell.append(&MenuItem::with_id(
        app,
        "close-tab",
        "Close Tab",
        true,
        Some("Shift+CmdOrCtrl+W"),
    )?)?;
    shell.append(&PredefinedMenuItem::separator(app)?)?;
    shell.append(&MenuItem::with_id(
        app,
        "split-right",
        "Split Pane Right",
        true,
        Some("CmdOrCtrl+D"),
    )?)?;
    shell.append(&MenuItem::with_id(
        app,
        "split-down",
        "Split Pane Down",
        true,
        Some("Shift+CmdOrCtrl+D"),
    )?)?;
    shell.append(&PredefinedMenuItem::separator(app)?)?;
    shell.append(&MenuItem::with_id(
        app,
        "prev-pane",
        "Previous Pane",
        true,
        Some("CmdOrCtrl+["),
    )?)?;
    shell.append(&MenuItem::with_id(
        app,
        "next-pane",
        "Next Pane",
        true,
        Some("CmdOrCtrl+]"),
    )?)?;

    let view = Submenu::with_id(app, "cw-view", "View", true)?;
    view.append(&MenuItem::with_id(
        app,
        "toggle-vertical-tabs",
        "Toggle Vertical Tabs",
        true,
        Some("Shift+CmdOrCtrl+B"),
    )?)?;
    view.append(&PredefinedMenuItem::separator(app)?)?;
    view.append(&MenuItem::with_id(
        app,
        "open-search",
        "Search…",
        true,
        Some("CmdOrCtrl+F"),
    )?)?;

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
pub fn setup(_app: &AppHandle<Wry>) -> tauri::Result<()> {
    Ok(())
}
