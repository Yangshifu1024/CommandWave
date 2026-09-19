use tauri::AppHandle as BaseAppHandle;
#[cfg(not(target_os = "macos"))]
use tauri::Wry;
#[cfg(target_os = "macos")]
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    Emitter, Manager, Wry,
};

use std::collections::HashMap;
use std::sync::Mutex;

#[cfg(target_os = "macos")]
use crate::i18n::t;

/// What a menu rebuild needs to remember.
///
/// The menu is rebuilt whenever one of its inputs changes: the accelerators
/// (`rebuild_menu`, driven by the keybinding settings) or the language
/// (`set_ui_locale`, driven by the language setting). A rebuild triggered by
/// one of them still needs the other, so both are kept here rather than being
/// threaded through every caller.
///
/// Platform-independent on purpose: Windows/Linux have no native menu bar, but
/// they still carry the tray menu and the resolved locale.
pub struct MenuState {
    keybindings: Mutex<HashMap<String, String>>,
    locale: Mutex<String>,
}

impl Default for MenuState {
    fn default() -> Self {
        Self {
            keybindings: Mutex::new(HashMap::new()),
            locale: Mutex::new(crate::i18n::resolve_locale(None).to_string()),
        }
    }
}

impl MenuState {
    /// The accelerators the last rebuild used.
    pub fn keybindings(&self) -> HashMap<String, String> {
        self.keybindings.lock().expect("menu state mutex").clone()
    }

    pub fn set_keybindings(&self, keybindings: HashMap<String, String>) {
        *self.keybindings.lock().expect("menu state mutex") = keybindings;
    }

    /// The resolved UI language ("en" | "zh-CN").
    pub fn locale(&self) -> String {
        self.locale.lock().expect("menu state mutex").clone()
    }

    pub fn set_locale(&self, locale: &str) {
        *self.locale.lock().expect("menu state mutex") = locale.to_string();
    }
}

/// Built-in accelerators, used whenever the settings carry no override for
/// an action. Must stay in sync with `src/hooks/keybindings.ts`.
#[cfg(target_os = "macos")]
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

#[cfg(target_os = "macos")]
fn accel(overrides: &HashMap<String, String>, action: &str) -> Option<String> {
    if let Some(custom) = overrides.get(action) {
        if custom.is_empty() {
            return None; // explicitly unbound
        }
        return Some(custom.clone());
    }
    default_accelerator(action).map(|s| s.to_string())
}

/// Build the native application menu (iTerm2-style). Explicit accelerators
/// here also prevent macOS' default menu from intercepting keys like Cmd+W.
/// Clicks are routed by `route_events`, which is registered once per app (see
/// its own note).
///
/// macOS keeps this native menu (system convention); Windows and Linux use
/// the custom in-window title bar menu instead, so no native menu is
/// attached there (see `TitleBar.tsx`).
///
/// Called at launch and again whenever the keybindings or the language change;
/// every call replaces the whole menu.
///
/// `locale` is a resolved tag ("en" | "zh-CN", see `crate::i18n`).
#[cfg(target_os = "macos")]
pub fn setup(
    app: &BaseAppHandle<Wry>,
    keybindings: &HashMap<String, String>,
    locale: &str,
) -> tauri::Result<()> {
    let item = |id: &str, label: &str| -> tauri::Result<MenuItem<Wry>> {
        MenuItem::with_id(app, id, label, true, accel(keybindings, id))
    };

    let app_submenu = Submenu::with_id(app, "cw-app", "CommandWave", true)?;
    // "About" is a custom item, not `PredefinedMenuItem::about`: the predefined
    // one opens the system's About panel with a fixed, untranslatable label.
    // This item goes through the normal `cw-menu` route with the id `about`,
    // which the frontend opens as the in-app About window.
    app_submenu.append(&item("about", t(locale, "menu.app.about"))?)?;
    app_submenu.append(&PredefinedMenuItem::separator(app)?)?;
    app_submenu.append(&item(
        "check-for-updates",
        t(locale, "menu.app.checkForUpdates"),
    )?)?;
    app_submenu.append(&PredefinedMenuItem::separator(app)?)?;
    app_submenu.append(&item("open-settings", t(locale, "menu.app.settings"))?)?;
    app_submenu.append(&PredefinedMenuItem::separator(app)?)?;
    app_submenu.append(&PredefinedMenuItem::hide(app, None)?)?;
    app_submenu.append(&PredefinedMenuItem::hide_others(app, None)?)?;
    app_submenu.append(&PredefinedMenuItem::separator(app)?)?;
    app_submenu.append(&PredefinedMenuItem::quit(app, None)?)?;

    let edit = Submenu::with_id(app, "cw-edit", t(locale, "menu.edit"), true)?;
    edit.append(&PredefinedMenuItem::undo(app, None)?)?;
    edit.append(&PredefinedMenuItem::redo(app, None)?)?;
    edit.append(&PredefinedMenuItem::separator(app)?)?;
    edit.append(&PredefinedMenuItem::cut(app, None)?)?;
    edit.append(&PredefinedMenuItem::copy(app, None)?)?;
    edit.append(&PredefinedMenuItem::paste(app, None)?)?;
    edit.append(&item(
        "copy-last-output",
        t(locale, "menu.edit.copyLastOutput"),
    )?)?;
    edit.append(&PredefinedMenuItem::separator(app)?)?;
    edit.append(&PredefinedMenuItem::select_all(app, None)?)?;
    edit.append(&item("clear-buffer", t(locale, "menu.edit.clearBuffer"))?)?;

    let shell = Submenu::with_id(app, "cw-shell", t(locale, "menu.shell"), true)?;
    shell.append(&item("new-tab", t(locale, "menu.shell.newTab"))?)?;
    shell.append(&item("close-pane", t(locale, "menu.shell.closePane"))?)?;
    shell.append(&item("close-tab", t(locale, "menu.shell.closeTab"))?)?;
    shell.append(&PredefinedMenuItem::separator(app)?)?;
    shell.append(&item("split-right", t(locale, "menu.shell.splitRight"))?)?;
    shell.append(&item("split-down", t(locale, "menu.shell.splitDown"))?)?;
    shell.append(&PredefinedMenuItem::separator(app)?)?;
    shell.append(&item("prev-pane", t(locale, "menu.shell.prevPane"))?)?;
    shell.append(&item("next-pane", t(locale, "menu.shell.nextPane"))?)?;

    let view = Submenu::with_id(app, "cw-view", t(locale, "menu.view"), true)?;
    view.append(&item(
        "toggle-vertical-tabs",
        t(locale, "menu.view.toggleVerticalTabs"),
    )?)?;
    view.append(&PredefinedMenuItem::separator(app)?)?;
    view.append(&item("open-search", t(locale, "menu.view.search"))?)?;
    view.append(&PredefinedMenuItem::separator(app)?)?;
    view.append(&item("prev-mark", t(locale, "menu.view.prevPrompt"))?)?;
    view.append(&item("next-mark", t(locale, "menu.view.nextPrompt"))?)?;

    let window = Submenu::with_id(app, "cw-window", t(locale, "menu.window"), true)?;
    window.append(&PredefinedMenuItem::minimize(app, None)?)?;
    window.append(&PredefinedMenuItem::maximize(app, None)?)?;

    let menu = Menu::new(app)?;
    menu.append(&app_submenu)?;
    menu.append(&edit)?;
    menu.append(&shell)?;
    menu.append(&view)?;
    menu.append(&window)?;
    app.set_menu(menu)?;
    Ok(())
}

/// Route native-menu clicks to the focused webview as `cw-menu` events.
///
/// Called exactly once, from `lib.rs` setup. `tauri` *appends* a handler per
/// `on_menu_event` call, it does not replace one: registering the route inside
/// `setup` — which runs again on every keybinding edit and, now, on every
/// language switch — delivered each click once per rebuild, so a menu action
/// fired N times after N rebuilds. The route outlives the menu it serves, so
/// it belongs to the app rather than to the menu build.
#[cfg(target_os = "macos")]
pub fn route_events(app: &BaseAppHandle<Wry>) {
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
}

/// No native menu on Windows/Linux, hence no menu events to route: the custom
/// title bar menu (TitleBar.tsx) handles its own clicks in-window.
#[cfg(not(target_os = "macos"))]
pub fn route_events(_app: &BaseAppHandle<Wry>) {}

/// No native menu on Windows/Linux: the custom title bar menu (TitleBar.tsx)
/// owns these commands in-window (and is translated on the frontend side, so
/// `locale` is unused here).
#[cfg(not(target_os = "macos"))]
pub fn setup(
    _app: &BaseAppHandle<Wry>,
    _keybindings: &HashMap<String, String>,
    _locale: &str,
) -> tauri::Result<()> {
    Ok(())
}
