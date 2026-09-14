//! System tray / menu-bar icon for agent attention.
//!
//! The icon is always present. When an agent needs the user it carries a
//! macOS menu-bar count (`set_title`); on Windows/Linux the count goes into
//! the tooltip (Linux shows neither, so the menu is the surface). The menu
//! lists the panes currently waiting on the user and focuses one on click.

use serde::Deserialize;
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Wry};

pub const TRAY_ID: &str = "commandwave-tray";

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AttentionItem {
    pub pane_id: String,
    pub label: String,
    pub state: String,
}

/// Draw a tiny monochrome prompt glyph (a chevron + underscore) into an RGBA
/// buffer. A template image (black + alpha) is required on macOS; on other
/// platforms the black glyph simply reads on a light or dark tray.
fn draw_icon(count: u32) -> Image<'static> {
    const SIZE: u32 = 32;
    let mut rgba = vec![0u8; (SIZE * SIZE * 4) as usize];
    let mut put = |x: u32, y: u32| {
        if x >= SIZE || y >= SIZE {
            return;
        }
        let i = ((y * SIZE + x) * 4) as usize;
        rgba[i] = 0;
        rgba[i + 1] = 0;
        rgba[i + 2] = 0;
        rgba[i + 3] = 255;
    };
    // Chevron ">" — two strokes.
    for t in 0..11u32 {
        put(9 + t, 10 + t);
        put(9 + t, 20 - t);
        put(10 + t, 10 + t);
        put(10 + t, 20 - t);
    }
    // Underscore bar.
    for x in 17..24u32 {
        for y in 20..23u32 {
            put(x, y);
        }
    }
    // Attention badge: a filled dot in the top-right when something waits.
    if count > 0 {
        for x in 18..31u32 {
            for y in 1..14u32 {
                let dx = (x as i32 - 24).abs();
                let dy = (y as i32 - 7).abs();
                if dx * dx + dy * dy <= 42 {
                    put(x, y);
                }
            }
        }
    }
    Image::new_owned(rgba, SIZE, SIZE)
}

fn build_menu(app: &AppHandle, items: &[AttentionItem]) -> tauri::Result<Menu<Wry>> {
    let menu = Menu::new(app)?;
    if items.is_empty() {
        let idle = MenuItem::with_id(app, "idle", "No agents need you", false, None::<&str>)?;
        menu.append(&idle)?;
    } else {
        for item in items {
            let label = format!("{}  ·  {}", item.label, state_word(&item.state));
            let mi = MenuItem::with_id(
                app,
                format!("pane:{}", item.pane_id),
                label,
                true,
                None::<&str>,
            )?;
            menu.append(&mi)?;
        }
    }
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    let show = MenuItem::with_id(app, "show", "Show CommandWave", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit CommandWave", true, None::<&str>)?;
    menu.append(&show)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&quit)?;
    Ok(menu)
}

fn state_word(state: &str) -> &'static str {
    match state {
        "needs-you" => "needs you",
        "error" => "error",
        "working" => "working",
        "done" => "done",
        _ => "waiting",
    }
}

fn focus_pane(app: &AppHandle, pane_id: &str) {
    // The window hosting the pane focuses it; fall back to a global emit so
    // the main window can route by pane id.
    let mut delivered = false;
    for (_, webview) in app.webview_windows() {
        let _ = webview.emit("cw-attention-focus", pane_id.to_string());
        delivered = true;
    }
    if !delivered {
        let _ = app.emit("cw-attention-focus", pane_id.to_string());
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let menu = build_menu(app, &[])?;
    let tray = TrayIconBuilder::with_id(TRAY_ID)
        .icon(draw_icon(0))
        .icon_as_template(true)
        .tooltip("CommandWave")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            if let Some(pane_id) = id.strip_prefix("pane:") {
                focus_pane(app, pane_id);
            } else if id == "show" {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            } else if id == "quit" {
                app.exit(0);
            }
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
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;
    let _ = tray;
    Ok(())
}

/// Push the current attention set into the tray (menu, tooltip, macOS title).
pub fn update(app: &AppHandle, items: &[AttentionItem], count: u32) -> tauri::Result<()> {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return Ok(());
    };
    let menu = build_menu(app, items)?;
    tray.set_menu(Some(menu))?;
    tray.set_icon(Some(draw_icon(count)))?;
    let tooltip = if count == 0 {
        "CommandWave".to_string()
    } else {
        format!("CommandWave — {count} agent(s) need you")
    };
    let _ = tray.set_tooltip(Some(&tooltip));
    #[cfg(target_os = "macos")]
    {
        let title = if count == 0 {
            None
        } else {
            Some(count.to_string())
        };
        let _ = tray.set_title(title.as_deref());
    }
    #[cfg(not(target_os = "macos"))]
    let _ = count;
    Ok(())
}
